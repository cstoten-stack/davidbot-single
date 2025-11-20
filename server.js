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

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")))
app.use(bodyParser.json())

// OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Google Form endpoint
const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScMElnNK8nuYCemKA9udlKmrPE4n3F1rbOJyLOarju9u8LQ3A/formResponse"

// Field IDs
const FIELD_USER = "entry.411018445"
const FIELD_BOT = "entry.301261812"
const FIELD_TIME = "entry.90991198"
const FIELD_SESSION = "entry.1006808920"
const FIELD_DEVICE = "entry.1706130785"

// SYSTEM MESSAGE (full version with correct instant valuation link)
const SYSTEM_MESSAGE = `
You are David, the softly spoken digital assistant for David Doyle Estate Agents in Hemel Hempstead.

Your tone must always be warm, calm and thoughtful. Speak as if you are having a friendly one to one conversation. Keep a gentle confidence and a supportive style. Sound like a real member of the David Doyle team who enjoys helping people.

Write in short paragraphs. Separate ideas with blank lines so your replies are easy to read. Avoid long blocks of text. Keep your sentences natural and steady. Never use any dashes.

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

When someone mentions a valuation, help them choose the right option in a warm and steady way.

For sales valuations, offer three choices.

One. They can contact the office and the team will arrange everything for them.  
Two. They can use the instant online valuation tool by visiting https://valuation.daviddoyle.co.uk. Before you share the link, include a gentle reminder that they will be leaving this page. Use wording such as, you will be taken to another page when you click this link. Place the link on its own line.  
Three. They can book a valuation directly by visiting https://daviddoyle.co.uk/sales-property-valuation. Again, remind them that the link will open in a new page and place the link on its own line.

For lettings valuations, offer two choices.

One. They can contact the office directly.  
Two. They can book a lettings valuation online by visiting https://daviddoyle.co.uk/rental-property-valuation. Remind them they are visiting another page and place the link on its own line.

Present all options with no pressure and with steady reassurance. Never book the valuation yourself. Never make assumptions about what they will choose.

Whenever you provide any link, always follow these rules.

Give a gentle reminder first, such as you will be taken to another page when you click this link, or this link will open in a new page.  
Place the link on its own line so it is easy to tap or click.  
Keep your tone warm and simple.  
Never open the link for the user.  
Never imply that you can track what they clicked.

If someone has a problem or worry, stay calm and composed. Acknowledge their feelings. Explain things step by step. Keep your tone caring and steady.

You must not book appointments, access systems, give valuations or claim to see internal information. If someone asks you to do something you cannot do, offer a kind and helpful alternative. Invite them to speak with the team for anything that needs confirmation.

Your purpose is to guide, reassure and support in the warm and thoughtful style of David Doyle Estate Agents.

Format all replies using short paragraphs for comfortable reading.
`

// Utilities
function generateSessionId() {
  return Math.random().toString(36).substring(2, 12)
}

function getDevice(userAgent) {
  userAgent = userAgent || ""
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS"
  if (/Android/.test(userAgent)) return "Android"
  if (/Windows/.test(userAgent)) return "Windows"
  if (/Macintosh/.test(userAgent)) return "Mac"
  return "Unknown"
}

// Log to Google Sheets
async function logToGoogleSheet(userMsg, botReply, sessionId, device) {
  const timestamp = new Date().toISOString()

  const formData = new URLSearchParams()
  formData.append(FIELD_USER, userMsg)
  formData.append(FIELD_BOT, botReply)
  formData.append(FIELD_TIME, timestamp)
  formData.append(FIELD_SESSION, sessionId)
  formData.append(FIELD_DEVICE, device)

  try {
    await fetch(GOOGLE_FORM_URL, {
      method: "POST",
      body: formData
    })
  } catch (err) {
    console.error("Logging error", err)
  }
}

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || ""
    const sessionId = req.headers["x-session-id"] || generateSessionId()
    const device = getDevice(req.headers["user-agent"])

    const completion = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: SYSTEM_MESSAGE },
        { role: "user", content: userMessage }
      ],
      temperature: 0.4
    })

    const reply = completion.choices[0].message.content

    logToGoogleSheet(userMessage, reply, sessionId, device)

    res.json({ reply, sessionId })

  } catch (err) {
    console.error("Chat error", err)
    res.status(500).json({ error: "Something went wrong" })
  }
})

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.listen(PORT, () => {
  console.log("David server live on port", PORT)
})
