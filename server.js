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

// Support Board Cloud API
// Your SupportBoard Cloud base is: https://cloud.board.support/script
// API endpoint for the web API is:
const SB_API_URL = "https://cloud.board.support/script/include/api.php"
// Token is stored as an environment variable in Render
const SB_TOKEN = process.env.SUPPORTBOARD_TOKEN

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

You follow these structural steps in most replies.

One. Acknowledge the question in a warm and human way.  
Two. Offer a clear and helpful explanation.  
Three. Break the answer into short paragraphs.  
Four. Give a soft optional next step.  
Five. Close with a gentle and open tone.

Adapt your tone to the person you are speaking to.

Speaking to sellers.  
Be warm, confident and steady. Explain processes in a simple way. Help them feel informed without feeling pushed. Guide them naturally.

Speaking to buyers.  
Be reassuring and friendly. Buyers are often unsure. Give simple explanations and help them feel comfortable.

Speaking to landlords.  
Be calm, clear and professional. Landlords value clarity and responsibility. Explain how things usually work and offer support.

Speaking to tenants.  
Be kind and patient. Tenants appreciate clear and fair guidance. Keep your explanations gentle and easy to follow.

Only answer questions that relate to property, the housing market, buying or selling a home, renting, letting, valuations, the local Hemel Hempstead area or the services offered by David Doyle Estate Agents. Stay focused on what an estate agent would naturally help with.

If someone asks about anything unrelated to these areas, respond politely and gently. Acknowledge the question kindly, explain that it is outside what an estate agent would normally help with, and suggest they may find a search engine useful.

When someone mentions a valuation, help them choose the right option in a calm and steady way.

For sales valuations, offer three choices.

One. They can contact the office and the team will arrange everything for them.  
Two. They can use the instant online valuation tool at https colon slash slash valuation dot daviddoyle dot co dot uk. Remind them they will be leaving this page. Place the link on its own line.  
Three. They can book a sales valuation directly at https colon slash slash daviddoyle dot co dot uk slash sales property valuation. Remind them it will open in a new page and place the link on its own line.

For lettings valuations, offer two choices.

One. They can contact the office directly.  
Two. They can book a lettings valuation online at https colon slash slash daviddoyle dot co dot uk slash rental property valuation. Remind them it will open in a new page and place the link on its own line.

Present all valuation choices with no pressure and with steady reassurance. Never book the valuation yourself.

Whenever you provide any link, always remind people that it will open a new page. Place each link on its own line so it is easy to tap or click. Keep your tone warm and simple. Never open the link for the user and never imply that you can track what they clicked.

If someone has a problem or worry, stay calm and composed. Acknowledge their feelings. Explain things step by step. Keep your tone caring and steady.

You must not book appointments, access systems, give valuations or claim to see internal information. If someone asks you to do something you cannot do, offer a kind and helpful alternative. Invite them to speak with the team for anything that needs confirmation.

Your purpose is to guide, reassure and support in the warm and thoughtful style of David Doyle Estate Agents.

Format all replies using short paragraphs for comfortable reading.
`

// Utilities

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

  if (
    m.includes("sell") ||
    m.includes("selling") ||
    m.includes("vendor") ||
    m.includes("sale") ||
    m.includes("market appraisal") ||
    m.includes("sales valuation")
  ) {
    return "seller"
  }

  if (
    m.includes("buy") ||
    m.includes("buying") ||
    m.includes("first time buyer") ||
    m.includes("offer") ||
    m.includes("viewing") ||
    m.includes("see the property")
  ) {
    return "buyer"
  }

  if (
    m.includes("landlord") ||
    m.includes("let") ||
    m.includes("letting") ||
    m.includes("rent out") ||
    m.includes("renting out") ||
    m.includes("rental income")
  ) {
    return "landlord"
  }

  if (
    m.includes("tenant") ||
    m.includes("rent") ||
    m.includes("renting") ||
    m.includes("to let") ||
    m.includes("apply for") ||
    m.includes("rental property")
  ) {
    return "tenant"
  }

  return "unknown"
}

function classifySubject(message) {
  const m = (message || "").toLowerCase()

  if (m.includes("valuation") || m.includes("value my") || m.includes("worth") || m.includes("market appraisal")) {
    return "valuation"
  }

  if (m.includes("viewing") || m.includes("view") || m.includes("see the property") || m.includes("appointment to view")) {
    return "viewing"
  }

  if (m.includes("advice") || m.includes("help") || m.includes("guidance") || m.includes("recommend")) {
    return "advice"
  }

  if (m.includes("just looking") || m.includes("curious") || m.includes("browsing")) {
    return "curious"
  }

  if (m.includes("contact") || m.includes("phone") || m.includes("call you") || m.includes("email you") || m.includes("speak to")) {
    return "contact"
  }

  if (m.includes("complain") || m.includes("complaint") || m.includes("unhappy") || m.includes("issue") || m.includes("problem")) {
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

// Google Sheets logging

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

// Call Support Board Cloud API

async function callSupportBoard(params) {
  if (!SB_TOKEN) {
    throw new Error("SUPPORTBOARD_TOKEN is not set")
  }

  const formData = new URLSearchParams()
  formData.append("token", SB_TOKEN)

  for (const [key, value] of Object.entries(params)) {
    formData.append(key, String(value))
  }

  const response = await fetch(SB_API_URL, {
    method: "POST",
    body: formData
  })

  const data = await response.json()
  return data
}

// Helpers for polling

let lastPollDateTime = null
const processedMessageIds = new Set()

function toSBDateTime(date) {
  const pad = n => String(n).padStart(2, "0")
  return (
    date.getUTCFullYear() +
    "-" +
    pad(date.getUTCMonth() + 1) +
    "-" +
    pad(date.getUTCDate()) +
    " " +
    pad(date.getUTCHours()) +
    ":" +
    pad(date.getUTCMinutes()) +
    ":" +
    pad(date.getUTCSeconds())
  )
}

function getPollDateTime() {
  if (lastPollDateTime) return lastPollDateTime
  const d = new Date(Date.now() - 60 * 60 * 1000)
  return toSBDateTime(d)
}

// Optional health check endpoint

app.post("/sb-webhook", (req, res) => {
  res.json({ status: "ok" })
})

// Training webhook endpoint (not used if Pabbly owns the webhook already)

app.post("/sb-chat", async (req, res) => {
  try {
    const userMessage = req.body.message || ""
    const sessionId = req.headers["x-session-id"] || generateSessionId()
    const device = getDevice(req.headers["user-agent"])
    const origin = "supportboard"

    const enquiryType = classifyEnquiryType(userMessage)
    const subject = classifySubject(userMessage)

    const reply = await getDavidReply(userMessage)

    await logToGoogleSheet(userMessage, reply, sessionId, device, origin, enquiryType, subject)

    res.json({ status: "logged" })
  } catch (err) {
    console.error("SupportBoard chat error", err)
    res.status(500).json({ error: "Something went wrong" })
  }
})

// Support Board API polling endpoint
// Training mode only: log suggested replies, do not send back to SupportBoard

app.get("/sb-poll", async (req, res) => {
  try {
    const datetime = getPollDateTime()

    const sbResponse = await callSupportBoard({
      function: "get-new-conversations",
      datetime: datetime,
      routing: "false",
      routing_unassigned: "false"
    })

    if (!sbResponse || sbResponse.success !== true) {
      console.error("SupportBoard API error", sbResponse)
      return res.status(500).json({ error: "SupportBoard API error" })
    }

    const conversations = sbResponse.response || []
    let processedCount = 0

    for (const conv of conversations) {
      const messageId = conv.message_id
      const messageUserType = (conv.message_user_type || "").toLowerCase()
      const conversationId = conv.conversation_id
      const userMessage = conv.message || ""

      if (!messageId || processedMessageIds.has(messageId)) continue

      if (messageUserType === "bot" || messageUserType === "agent") {
        processedMessageIds.add(messageId)
        continue
      }

      const origin = "supportboard"
      const device = "supportboard"

      const enquiryType = classifyEnquiryType(userMessage)
      const subject = classifySubject(userMessage)

      const reply = await getDavidReply(userMessage)

      await logToGoogleSheet(userMessage, reply, conversationId, device, origin, enquiryType, subject)

      processedMessageIds.add(messageId)
      processedCount++
    }

    lastPollDateTime = toSBDateTime(new Date())

    res.json({
      status: "ok",
      fetched: conversations.length,
      processed: processedCount,
      since: datetime,
      now: lastPollDateTime
    })
  } catch (err) {
    console.error("SupportBoard polling error", err)
    res.status(500).json({ error: "Something went wrong" })
  }
})

// Main chat endpoint for your website and direct use

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || ""
    const sessionId = req.headers["x-session-id"] || generateSessionId()
    const device = getDevice(req.headers["user-agent"])

    const originHeader = req.headers["x-origin"]
    const origin = originHeader || "website"

    const enquiryType = classifyEnquiryType(userMessage)
    const subject = classifySubject(userMessage)

    const reply = await getDavidReply(userMessage)

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
