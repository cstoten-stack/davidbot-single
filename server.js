import express from "express"
import bodyParser from "body-parser"
import OpenAI from "openai"
import path from "path"
import { fileURLToPath } from "url"

const app = express()
const PORT = process.env.PORT || 3001

// Allow this site to be embedded in iframes
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL")
  res.setHeader("Content-Security-Policy", "frame-ancestors *")
  next()
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// serve static files from /public
app.use(express.static(path.join(__dirname, "public")))
app.use(bodyParser.json())

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const SYSTEM_MESSAGE = `
You are David, the softly spoken digital assistant for David Doyle Estate Agents in Hemel Hempstead.
Follow all tone and behaviour guidelines.
Avoid using dashes.
Stay warm and helpful.
Do not book appointments or access systems.
`

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || ""

    const completion = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: SYSTEM_MESSAGE },
        { role: "user", content: userMessage }
      ],
      temperature: 0.4
    })

    const reply = completion.choices[0].message.content
    res.json({ reply })
  } catch (err) {
    console.error("Chat error", err)
    res.status(500).json({ error: "Something went wrong" })
  }
})

// fallback to index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.listen(PORT, () => {
  console.log("David server live on port", PORT)
})

