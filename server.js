import express from "express"
import bodyParser from "body-parser"
import OpenAI from "openai"
import path from "path"
import { fileURLToPath } from "url"
import fetch from "node-fetch"

const app = express()
const PORT = process.env.PORT || 3001

// Allow embedding in iframe
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL")
  res.setHeader("Content-Security-Policy", "frame-ancestors *")
  next()
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Serve frontend
app.use(express.static(path.join(__dirname, "public")))
app.use(bodyParser.json())

// OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Google Form endpoint
const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScMElnNK8nuYCemKA9udlKmrPE4n3F1rbOJyLOarju9u8LQ3A/formResponse"

// Google Form field IDs
const FIELD_USER = "entry.411018445"
const FIELD_BOT = "entry.301261812"
const FIELD_TIME = "entry.90991198"
const FIELD_SESSION = "entry.1006808920"
const FIELD_DEVICE = "entry.1706130785"
const FIELD_ORIGIN = "entry.281008233"
const FIELD_ENQUIRY_TYPE = "entry.2094658670"
const FIELD_SUBJECT = "entry.255865039"

// System message for David
const SYSTEM_MESSAGE = `
You are David, the softly spoken digital assistant for David Doyle Estate Agents in Hemel Hempstead.

Your tone must always be warm, calm and thoughtful. Speak as if you are having a friendly one to one conversation. Keep a gentle confidence and a supportive style. Sound like a real member of the David Doyle team who enjoys helping people.

Write in short paragraphs. Leave a blank line between ideas so your replies are easy to read. Avoid long blocks of text. Keep your sentences natural and steady. Never use any dashes.

Your overall communication style should be reassuring, clear and human. You help people understand what comes next without any pressure. You explain things in a simple and grounded way, using local knowledge when helpful.

Only answer questions that relate to property, the housing market, buying or selling a home, renting, letting, valuations, the local Hemel Hempstead area or the services offered by David Doyle Estate Agents. Stay focused on what an estate agent would naturally help with.

If someone asks about anything unrelated to these areas, respond politely and gently. Acknowledge the question kindly, explain that it is outside what an estate agent would normally help with, and suggest they may find a search engine useful.

When someone mentions a valuation, offer the correct options depending on sales or lettings in a calm and steady way.

For sales valuations, offer three choices.

One. They can contact the office and the team will arrange everything for them.  
Two. They can use the instant online valuation tool at https colon slash slash valuation dot daviddoyle dot co dot uk. Remind them they will be leaving this page. Place the link on its own line.  
Three. They can book a sales valuation directly at https colon slash slash daviddoyle dot co dot uk slash sales property valuation. Remind them it will open in a new page and place the link on its own line.

For lettings valuations, offer two choices.

One. They can contact the office directly.  
Two. They can book a lettings valuation online at https colon slash slash daviddoyle dot co dot uk slash rental property valuation. Remind them it will open in a new page and place the link on its own line.

Present all valuation choices with no pressure and with steady reassurance. Never book the valuation yourself.

If someone has a problem or worry, stay calm and composed. Acknowledge their feelings. Explain things step by step. Keep your tone caring and steady.

You must not book appointments, access systems, give valuations or claim to see internal information. If someone asks you to do something you cannot do, offer a kind and helpful alternative. Invite them to speak with the team for anything that needs confirmation.

Your purpose is to guide, reassure and support in the warm and thoughtful style of David Doyle Estate Agents.

Format all replies using short paragraphs for comfortable reading.
`

// Utility functions

function generateSessionId() {
  return Math.random().toString(36).substring(2, 12)
}

function getDevice(agent) {
  agent = agent || ""
  if (/iPhone|iPad|iPod/.test(agent)) return "iOS"
  if (/Android/.test(agent)) return "Android"
  if (/Windows/.test(agent)) return "Windows"
  if (/Macintosh/.test(agent)) return "Mac"
  return "Unknown"
}

function classifyEnquiryType(message) {
  const m = (message || "").toLowerCase()

  if (m.includes("sell") || m.includes("selling") || m.includes("valuation") || m.includes("market appraisal")) {
    return "seller"
  }

  if (
    m.includes("buy") ||
    m.includes("buying") ||
    m.includes("first time buyer") ||
    m.includes("viewing") ||
    m.includes("offer")
  ) {
    return "buyer"
  }

  if (
    m.includes("landlord") ||
    m.includes("let") ||
    m.includes("letting") ||
    m.includes("rent out") ||
    m.includes("renting out")
  ) {
    return "landlord"
  }

  if (
    m.includes("tenant") ||
    m.includes("rent") ||
    m.includes("rental property") ||
    m.includes("to let")
  ) {
    return "tenant"
  }

  return "unknown"
}

function classifySubject(message) {
  const m = (message || "").toLowerCase()

  if (m.includes("valuation") || m.includes("worth") || m.includes("market appraisal")) {
    return "valuation"
  }

  if (
    m.includes("viewing") ||
    m.includes("view") ||
    m.includes("see the property") ||
    m.includes("appointment")
  ) {
    return "viewing"
  }

  if (m.includes("advice") || m.includes("help") || m.includes("guidance") || m.includes("recommend")) {
    return "advice"
  }

  if (
    m.includes("just looking") ||
    m.includes("curious") ||
    m.includes("browsing")
  ) {
    return "curious"
  }

  if (
    m.includes("contact") ||
    m.includes("phone") ||
    m.includes("call you") ||
    m.includes("email you") ||
    m.includes("speak to")
  ) {
    return "contact"
  }

  if (
    m.includes("complain") ||
    m.includes("complaint") ||
    m.includes("unhappy") ||
    m.includes("issue") ||
    m.includes("problem")
  ) {
    return "complaint"
  }

  if (m.includes("rent") || m.includes("letting") || m.includes("tenant") || m.includes("rental")) {
    return "rental"
  }

  if (m.includes("sell") || m.includes("selling") || m.includes("sale") || m.includes("vendor")) {
    return "sale"
  }

  if (m.includes("mortgage")) {
    return "mortgage"
  }

  if (
    m.includes("school") ||
    m.includes("area") ||
    m.includes("neighbourhood") ||
    m.includes("local") ||
    m.includes("hemel")
  ) {
    return "local"
  }

  if (
    m.includes("question") ||
    m.includes("enquiry") ||
    m.includes("inquiry") ||
    m.includes("ask about")
  ) {
    return "enquiry"
  }

  return "other"
}

// Detect search intent for buy or rent

function detectSearchIntent(message) {
  const m = (message || "").toLowerCase()

  const hasRentWord =
    m.includes("rent") ||
    m.includes("renting") ||
    m.includes("to let") ||
    m.includes("rental") ||
    m.includes("tenant")

  const hasBuyWord =
    m.includes("buy") ||
    m.includes("buying") ||
    m.includes("purchase") ||
    m.includes("mortgage") ||
    m.includes("offer")

  const hasPropertyWord =
    m.includes("home") ||
    m.includes("house") ||
    m.includes("flat") ||
    m.includes("apartment") ||
    m.includes("property") ||
    m.includes("place")

  if (hasRentWord && !hasBuyWord) return "rent"
  if (hasBuyWord && !hasRentWord) return "buy"

  if (hasPropertyWord && !hasBuyWord && !hasRentWord) {
    return "unclearProperty"
  }

  return "none"
}

// Track clarification prompts per session

const clarificationCounts = new Map()

function getClarificationCount(sessionId) {
  return clarificationCounts.get(sessionId) || 0
}

function setClarificationCount(sessionId, value) {
  clarificationCounts.set(sessionId, value)
}

// Logging to Google Sheets

async function logToGoogleSheet(userMsg, botReply, sessionId, device, origin, enquiryType, subject) {
  const timestamp = new Date().toISOString()
  const formData = new URLSearchParams()

  formData.append(FIELD_USER, userMsg || "")
  formData.append(FIELD_BOT, botReply || "")
  formData.append(FIELD_TIME, timestamp)
  formData.append(FIELD_SESSION, sessionId || "")
  formData.append(FIELD_DEVICE, device || "")
  formData.append(FIELD_ORIGIN, origin || "")
  formData.append(FIELD_ENQUIRY_TYPE, enquiryType || "")
  formData.append(FIELD_SUBJECT, subject || "")

  try {
    await fetch(GOOGLE_FORM_URL, { method: "POST", body: formData })
  } catch (err) {
    console.error("Logging error", err)
  }
}

// Ask David via OpenAI

async function getDavidReply(userMessage) {
  const completion = await client.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: userMessage || "" }
    ],
    temperature: 0.4
  })

  return completion.choices[0].message.content
}

// Standardised link blocks

function buildSalesLinkBlock() {
  return `
If you would like to see what is available right now, you can browse the homes we currently have for sale. The link will open in a new page.

https://daviddoyle.co.uk/listings
`.trim()
}

function buildRentalLinkBlock() {
  return `
If you would like to see the properties that are available to let, you can browse our current rental homes. The link will open in a new page.

https://daviddoyle.co.uk/listings?saleOrRental=Rental&sortby=dateListed-desc
`.trim()
}

// Main chat endpoint for your website and direct use

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || ""
    const sessionId = req.headers["x-session-id"] || generateSessionId()
    const device = getDevice(req.headers["user-agent"])
    const origin = "website"

    const enquiryType = classifyEnquiryType(userMessage)
    const subject = classifySubject(userMessage)
    const intent = detectSearchIntent(userMessage)

    let reply = ""

    if (intent === "buy") {
      // Clear clarification count for this session
      setClarificationCount(sessionId, 0)

      const baseReply = await getDavidReply(userMessage)
      reply = baseReply + "\n\n" + buildSalesLinkBlock()

    } else if (intent === "rent") {
      setClarificationCount(sessionId, 0)

      const baseReply = await getDavidReply(userMessage)
      reply = baseReply + "\n\n" + buildRentalLinkBlock()

    } else if (intent === "unclearProperty") {
      const count = getClarificationCount(sessionId)

      if (count < 1) {
        // First gentle clarification
        reply = `
Thank you for letting me know you are looking for a home.

To point you in the right direction, are you hoping to buy or rent?

Once I know that, I can guide you more clearly and share the best link for you.
`.trim()
        setClarificationCount(sessionId, 1)
      } else if (count < 2) {
        // Second gentle clarification
        reply = `
Of course, I can help with that.

Just so I show you the right homes, are you hoping to buy or rent?

After that I can suggest the most helpful next steps and share a link you can use to browse.
`.trim()
        setClarificationCount(sessionId, 2)
      } else {
        // After two unclear answers, show sales link and reset
        reply = `
Thank you for your patience.

Here are the homes we currently have for sale. The page will open in a new tab and you can also switch to rental properties from there if you prefer.

https://daviddoyle.co.uk/listings
`.trim()
        setClarificationCount(sessionId, 0)
      }

    } else {
      // General property or local question, let David answer normally
      setClarificationCount(sessionId, 0)
      reply = await getDavidReply(userMessage)
    }

    await logToGoogleSheet(userMessage, reply, sessionId, device, origin, enquiryType, subject)

    res.json({ reply, sessionId })
  } catch (err) {
    console.error("Chat error", err)
    res.status(500).json({ error: "Something went wrong" })
  }
})

// Serve UI

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.listen(PORT, () => {
  console.log("David server running on port", PORT)
})
