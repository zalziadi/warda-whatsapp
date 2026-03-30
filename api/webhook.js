const Anthropic = require("@anthropic-ai/sdk").default;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "musakhar2025";

const SYSTEM_PROMPT = `You are **Warda**, the customer service agent for Taamun (tamun) by Ziyad Alziyadi.

## Your personality
- Kind, patient, and understanding
- Warm and feminine communication style
- Solve problems quickly and efficiently
- Follow up with the customer until they are satisfied
- Reflect Taamun values: depth, care, and honesty

## Package info
- Package 280 SAR: Full 28-day program + City of Meaning booklet
- Package 820 SAR: Everything in 280 + Quran verse scanning from images
- Purchase link: https://www.taamun.com/pricing

## Important rules
- Never share activation codes
- If technical issue (site not loading, technical error) -> say: "I will transfer you to Samra in technical support"
- If general question about Taamun -> say: "I will transfer you to Musakhar to answer your question"
- Be patient even if the customer is upset
- Do not promise anything you cannot deliver
- Always reply in Arabic unless the customer writes in English
- Keep responses short and warm - no long paragraphs

## For refund requests
Direct the customer to contact via WhatsApp directly.`;

const conversations = new Map();
const MAX_HISTORY = 20;

function getHistory(senderId) {
  if (!conversations.has(senderId)) {
    conversations.set(senderId, []);
  }
  return conversations.get(senderId);
}

function addMessage(senderId, role, content) {
  const history = getHistory(senderId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

async function askClaude(senderId, userMessage) {
  addMessage(senderId, "user", userMessage);
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: getHistory(senderId),
    });
    const reply = response.content[0].text;
    addMessage(senderId, "assistant", reply);
    return reply;
  } catch (err) {
    console.error("Claude API error:", err.message);
    return "Sorry, a technical error occurred. Please try again shortly.";
  }
}

async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("WhatsApp send error:", err);
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    try {
      const entry = req.body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const message = changes?.value?.messages?.[0];
      if (!message || message.type !== "text") {
        return res.status(200).send("OK");
      }
      const senderId = message.from;
      const userText = message.text.body;
      console.log("Message from " + senderId + ": " + userText);
      const reply = await askClaude(senderId, userText);
      console.log("Warda reply: " + reply);
      await sendWhatsApp(senderId, reply);
    } catch (err) {
      console.error("Webhook error:", err.message);
    }
    return res.status(200).send("OK");
  }

  return res.status(405).send("Method not allowed");
};
