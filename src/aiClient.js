import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

// Environment variables
const token = import.meta.env.VITE_AZURE_OPENAI_API_KEY;
const endpoint = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
const modelDeploymentName = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT_NAME;

// Delay function (for retries)
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Helper: Strip code blocks or markdown from response
const extractContent = (content) => {
  let cleaned = content.trim();
  if (cleaned.startsWith("``````")) {
    cleaned = cleaned.slice(7, -3).trim();
  } else if (cleaned.startsWith("``````")) {
    cleaned = cleaned.slice(3, -3).trim();
  }
  return cleaned;
};

// Tech Fest Information Database
const techFestInfo = {
  eventName: "Tech Fest 2026",
  date: "2nd week of January 2026",
  dateRange: "January 9-15, 2026 (approximately)",
  programs: [
    {
      name: "Gaming Competition",
      description: "Exciting gaming tournaments featuring various games and skill levels. Compete with peers and win prizes!"
    },
    {
      name: "Food Stall",
      description: "Delicious food and refreshments available throughout the event. Enjoy a variety of cuisines and snacks."
    },
    {
      name: "Treasure Hunt",
      description: "Interactive treasure hunt activity with exciting prizes. Test your problem-solving skills and teamwork!"
    },
    {
      name: "Cinema Show",
      description: "Movie screening and entertainment programs. Relax and enjoy quality entertainment during the fest."
    },
    {
      name: "AI Room",
      description: "Explore artificial intelligence demonstrations and interactive AI experiences. See the future of AI technology!"
    },
    {
      name: "Gaming Room",
      description: "Virtual reality and gaming console stations. Experience next-gen gaming with VR and latest consoles."
    }
  ]
};

// Enhanced system prompt for tech fest
const assistantInstructions = `
You are JARVIS, an AI assistant created by MSC CS 1ST YEAR STUDENT JATHU for the Tech Fest event scheduled in the 2nd week of January 2026.

**YOUR CORE PURPOSE:**
- Answer ONLY questions related to the Tech Fest event
- Provide detailed information about event programs and activities
- Help attendees with event-related queries
- Be enthusiastic and welcoming about the event

**EVENT DETAILS:**
Tech Fest 2026 - 2nd Week of January (approximately January 9-15, 2026)

The Tech Fest features these amazing programs:
1. Gaming Competition - Exciting gaming tournaments with multiple games and skill levels
2. Food Stall - Wide variety of delicious food and refreshments
3. Treasure Hunt - Interactive treasure hunt with challenges and prizes
4. Cinema Show - Movie screening and entertainment programs
5. AI Room - AI demonstrations and interactive AI experiences
6. Gaming Room - VR setups and gaming console stations

**STRICT RULES:**
- ALWAYS answer tech fest-related questions directly and informatively
- If asked "Who created you?" or similar: Respond with "I was created by MSC CS 1ST YEAR STUDENT JATHU"
- For any out-of-topic questions, politely respond: "I'm JARVIS, your Tech Fest assistant! I'm here to help with questions about our Tech Fest happening in the 2nd week of January. What would you like to know about the event?"
- Keep responses concise but informative
- Be enthusiastic about the event
- Maintain focus on tech fest context only
- NEVER refuse to answer tech fest-related questions

**RESPONSE GUIDELINES:**
- Be warm, welcoming, and enthusiastic
- Provide event program details when asked about activities
- Explain what happens during the fest and when
- Direct attendees to relevant activities based on their interests
- Answer questions about date, time, programs, and activities
- Always relate responses back to the Tech Fest experience
`;

// Improved: More comprehensive topic detection
const isTechFestRelated = (userMessage) => {
  const messageLower = userMessage.toLowerCase();
  
  // Direct tech fest keywords
  const techFestKeywords = [
    "tech fest", "techfest", "event", "gaming", "competition", "food", 
    "treasure hunt", "cinema", "show", "ai room", "gaming room", "jarvis",
    "jathu", "created", "who", "when", "what", "which", "how", "where",
    "schedule", "date", "january", "programs", "activities", "happen",
    "will happen", "going to happen", "taking place", "happening",
    "vr", "virtual reality", "ai", "artificial intelligence", "movie",
    "stall", "competition", "hunt", "room", "gamer", "gaming"
  ];
  
  // Check if any keyword exists in the message
  const hasKeyword = techFestKeywords.some(keyword => messageLower.includes(keyword));
  
  // If no direct keyword, check for question patterns about the event
  const eventQuestionPatterns = [
    /what.*happening/i,
    /what.*going.*happen/i,
    /what.*event/i,
    /when.*happening/i,
    /when.*event/i,
    /is.*happening/i,
    /tell.*about/i,
    /describe.*event/i,
    /activities/i,
    /programs/i,
    /something.*do/i,
    /anything.*do/i
  ];
  
  const matchesPattern = eventQuestionPatterns.some(pattern => pattern.test(messageLower));
  
  // If contains general question words, treat as event-related (more permissive)
  // Only reject obvious off-topic queries
  const offTopicKeywords = [
    "recipe", "cook", "weather", "news", "sports score", "movie review",
    "song", "lyrics", "homework", "math problem", "assignment", 
    "general knowledge", "history", "politics", "covid", "vaccine"
  ];
  
  const isOffTopic = offTopicKeywords.some(keyword => messageLower.includes(keyword));
  
  // If it's clearly off-topic, reject it
  if (isOffTopic && !hasKeyword) {
    return false;
  }
  
  // Otherwise, be permissive and assume it's about the event
  return true;
};

// Format event information for display
const getEventInfoResponse = () => {
  const programs = techFestInfo.programs
    .map(p => `• ${p.name}: ${p.description}`)
    .join("\n\n");
  
  return `
🎉 **Tech Fest 2026** 🎉
📅 When: 2nd Week of January (approx. ${techFestInfo.dateRange})
📍 What's Happening:

${programs}

Looking forward to seeing you there! What would you like to know more about?
  `.trim();
};

export async function getAIResponse(userMessage, maxRetries = 3, delayMs = 2000) {
  // Check if question is tech fest related
  if (!isTechFestRelated(userMessage)) {
    return "I'm JARVIS, your Tech Fest assistant! 🤖 I'm specifically here to help with questions about our Tech Fest happening in the 2nd week of January. What would you like to know about the event, the programs, or any activities?";
  }

  // Special case: If asking for general event info, return formatted response
  const messageLower = userMessage.toLowerCase();
  if (messageLower.includes("what") && messageLower.includes("happen")) {
    return getEventInfoResponse();
  }

  const client = ModelClient(endpoint, new AzureKeyCredential(token));

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await client.path("/chat/completions").post({
      body: {
        messages: [
          { role: "system", content: assistantInstructions },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        top_p: 1.0,
        max_tokens: 500,
        model: modelDeploymentName,
      },
    });

    if (!isUnexpected(response)) {
      const content = response.body.choices?.[0]?.message?.content || "";
      return extractContent(content);
    }

    // Retry on rate-limit (429)
    if (response.status === 429 && attempt < maxRetries - 1) {
      await delay(delayMs);
    } else {
      const error = response.body?.error?.message || "Unexpected API error.";
      throw new Error(error);
    }
  }
}
