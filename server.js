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

When someone mentions a valuation, offer the correct options depending on sales or lettings. Always remind users that links open in a new page and place each link on its own line.

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

  if (m.includes("sell") || m.includes("valuation") || m.includes("market appraisal")) return "seller"
  if (m.includes("buy") || m.includes("viewing") || m.includes("offer")) return "buyer"
  if (m.includes("let") || m.includes("landlord") || m.includes("rent out")) return "landlord"
  if (m.includes("rent") || m.includes("tenant") || m.includes("apply")) return "tenant"
  return "unknown"
}

function classifySubject(message) {
  const m = (message || "").toLowerCase()

  if (m.includes("valuation") || m.includes("worth")) return "valuation"
  if (m.includes("view") || m.includes("appointment")) return "viewing"
  if (m.includes("advice")) return "advice"
  if (m.includes("contact") || m.includes("call") || m.includes("email")) return "contact"
  if (m.includes("curious") || m.includes("just looking")) return "curious"
  if (m.includes("complaint") || m.includes("issue")) return "complaint"
  if (m.includes("rent") || m.includes("rental")) return "rental"
  if (m.includes("sell")) return "sale"
  if (m.includes("local") || m.includes("area") || m.includes("school")) return "local"
  return "other"
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

// ⭐ MAIN WEBSITE CHAT ENDPOINT — ONLY THIS IS ACTIVE NOW

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || ""
    const sessionId = req.headers["x-session-id"] || generateSessionId()
    const device = getDevice(req.headers["user-agent"])
    const origin = "website"

    const enquiryType = classifyEnquiryType(userMessage)
    const subject = classifySubject(userMessage)

    const reply = await getDavidReply(userMessage)

    await logToGoogleSheet(
      userMessage,
      reply,
      sessionId,
      device,
      origin,
      enquiryType,
      subject
    )

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
