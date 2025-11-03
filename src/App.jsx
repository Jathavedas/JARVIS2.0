import { useState, useEffect, useRef } from "react";
import { getAIResponse } from "./aiClient";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import "./App.css";

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const silenceTimerRef = useRef(null);
  const utteranceRef = useRef(null);
  const lastTranscriptRef = useRef("");
  const lastTranscriptLengthRef = useRef(0);
  const chatBoxRef = useRef(null);
  const SILENCE_DURATION = 2000;

  const {
    transcript,
    resetTranscript,
    listening,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  // Auto-scroll to latest message
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // ✅ NEW: Check for HTTPS and browser support
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    return (
      <div className="chat-container">
        <div className="not-supported">
          <h1>🔒 HTTPS Required</h1>
          <p>Voice features require a secure HTTPS connection.</p>
          <p>This app works on https:// domains only.</p>
        </div>
      </div>
    );
  }

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="chat-container">
        <div className="not-supported">
          <h1>⚠️ Browser Not Supported</h1>
          <p>Please use Chrome, Edge, or Safari for voice features.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (isConversationActive && transcript && !isSpeaking && !loading) {
      setInput(transcript);
      
      if (transcript !== lastTranscriptRef.current) {
        lastTranscriptRef.current = transcript;
        lastTranscriptLengthRef.current = transcript.length;
        
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        
        silenceTimerRef.current = setTimeout(() => {
          if (transcript.trim()) {
            handleAutoSend(transcript);
          }
        }, SILENCE_DURATION);
      }
    }
  }, [transcript, isConversationActive, isSpeaking, loading]);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      SpeechRecognition.stopListening();
    };
  }, []);

  const speak = (text) => {
    return new Promise((resolve) => {
      if ('speechSynthesis' in window) {
        SpeechRecognition.stopListening();
        window.speechSynthesis.cancel();
        
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          utterance.lang = 'en-IN';
          
          utteranceRef.current = utterance;
          setIsSpeaking(true);

          utterance.onstart = () => {
            console.log("🔊 Started speaking");
            resetTranscript();
            lastTranscriptLengthRef.current = 0;
          };

          utterance.onend = () => {
            console.log("✅ Finished speaking");
            setIsSpeaking(false);
            utteranceRef.current = null;
            
            if (isConversationActive) {
              setTimeout(() => {
                resetTranscript();
                lastTranscriptRef.current = "";
                lastTranscriptLengthRef.current = 0;
                SpeechRecognition.startListening({ 
                  continuous: true,
                  language: 'en-IN'
                });
              }, 500);
            }
            
            resolve();
          };

          utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            setIsSpeaking(false);
            utteranceRef.current = null;
            resolve();
          };

          window.speechSynthesis.speak(utterance);
        }, 300);
      } else {
        resolve();
      }
    });
  };

  const startConversation = () => {
    setIsConversationActive(true);
    resetTranscript();
    lastTranscriptRef.current = "";
    lastTranscriptLengthRef.current = 0;
    
    SpeechRecognition.startListening({ 
      continuous: true,
      language: 'en-IN'
    });
  };

  const stopConversation = () => {
    setIsConversationActive(false);
    SpeechRecognition.stopListening();
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    setIsSpeaking(false);
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    resetTranscript();
    setInput("");
    lastTranscriptRef.current = "";
    lastTranscriptLengthRef.current = 0;
  };

  const handleAutoSend = async (message) => {
    if (!message.trim() || loading || isSpeaking) return;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    SpeechRecognition.stopListening();

    const userMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    resetTranscript();
    lastTranscriptRef.current = "";
    lastTranscriptLengthRef.current = 0;
    setLoading(true);

    try {
      const aiReply = await getAIResponse(message);
      const aiMessage = { role: "assistant", content: aiReply };
      setMessages((prev) => [...prev, aiMessage]);
      
      await speak(aiReply);
      
    } catch (err) {
      console.error("AI Error:", err);
      const errorMsg = "Sorry, I encountered an error. Please try again.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Error: " + err.message },
      ]);
      
      await speak(errorMsg);
      
    } finally {
      setLoading(false);
    }
  };

  const handleManualSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    const messageToSend = input;
    setInput("");
    resetTranscript();
    lastTranscriptRef.current = "";
    lastTranscriptLengthRef.current = 0;
    setLoading(true);

    SpeechRecognition.stopListening();

    try {
      const aiReply = await getAIResponse(messageToSend);
      const aiMessage = { role: "assistant", content: aiReply };
      setMessages((prev) => [...prev, aiMessage]);
      
      if (isConversationActive) {
        await speak(aiReply);
      }
    } catch (err) {
      console.error("AI Error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Error: " + err.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-wrapper">
      <div className="chat-container">
        <div className="header">
          <div className="header-content">
            <div className="logo-section">
              <div className="logo">🎤</div>
              <div className="header-text">
                <h1>JARVIS</h1>
                <p className="event-tagline">Tech Fest 2026 Assistant</p>
              </div>
            </div>
            <div className="tech-badge">Jan 2026</div>
          </div>
        </div>

        {isConversationActive && (
          <div className="status-bar">
            {isSpeaking && (
              <div className="status-item speaking">
                <span className="pulse"></span>
                <span>🔊 Speaking...</span>
              </div>
            )}
            {listening && !isSpeaking && !loading && (
              <div className="status-item listening">
                <span className="pulse"></span>
                <span>🎤 Listening...</span>
              </div>
            )}
            {loading && (
              <div className="status-item thinking">
                <span className="spinner"></span>
                <span>💭 Processing...</span>
              </div>
            )}
          </div>
        )}

        <div className="chat-box" ref={chatBoxRef}>
          {messages.length === 0 && !isConversationActive && (
            <div className="welcome-section">
              <div className="welcome-icon">🎉</div>
              <h2>Welcome to Tech Fest!</h2>
              <p>Ask me anything about our upcoming event</p>
              <div className="quick-questions">
                <p className="section-label">Quick questions:</p>
                <button className="quick-btn" onClick={() => {
                  setInput("What programs are available?");
                  handleManualSend();
                }}>
                  📋 What programs?
                </button>
                <button className="quick-btn" onClick={() => {
                  setInput("When is Tech Fest?");
                  handleManualSend();
                }}>
                  📅 When is it?
                </button>
                <button className="quick-btn" onClick={() => {
                  setInput("Tell me about AI Room");
                  handleManualSend();
                }}>
                  🤖 AI Room
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === "user" ? "👤" : "🤖"}
                </div>
                <div className="message-content">
                  <div className="message-text">{msg.content}</div>
                </div>
              </div>
            </div>
          ))}

          {input && isConversationActive && !isSpeaking && (
            <div className="message-wrapper user">
              <div className="message user preview">
                <div className="message-avatar">👤</div>
                <div className="message-content">
                  <div className="message-text preview-text">{input}</div>
                  <span className="preview-label">preview</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="input-section">
          <div className="input-wrapper">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSend()}
              placeholder={isConversationActive ? "Ask about Tech Fest..." : "Type your question..."}
              disabled={loading || isSpeaking}
              className="input-field"
            />
            <button 
              onClick={handleManualSend} 
              disabled={loading || !input.trim() || isSpeaking}
              className="send-btn"
            >
              {loading ? "..." : "➤"}
            </button>
          </div>
          
          <div className="controls-row">
            {!isConversationActive ? (
              <button 
                onClick={startConversation}
                className="btn voice-btn start"
                disabled={loading}
              >
                🎙️ Start Voice
              </button>
            ) : (
              <button 
                onClick={stopConversation}
                className="btn voice-btn stop"
              >
                ⏹️ Stop Voice
              </button>
            )}
          </div>

          {isConversationActive && (
            <p className="help-text">💡 Speak naturally. I respond after 2 seconds of silence.</p>
          )}
        </div>

        <div className="event-programs">
          <h3>🎯 Tech Fest Programs</h3>
          <div className="programs-grid">
            <div className="program-card">
              <span className="icon">🎮</span>
              <span>Gaming</span>
            </div>
            <div className="program-card">
              <span className="icon">🍕</span>
              <span>Food</span>
            </div>
            <div className="program-card">
              <span className="icon">🗺️</span>
              <span>Hunt</span>
            </div>
            <div className="program-card">
              <span className="icon">🎬</span>
              <span>Cinema</span>
            </div>
            <div className="program-card">
              <span className="icon">🤖</span>
              <span>AI Room</span>
            </div>
            <div className="program-card">
              <span className="icon">🕹️</span>
              <span>VR Gaming</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
