/* =====================================================================
   ENEMY AI - Vorthari Alien Dialogue System
   Uses Cohere API for intelligent conversation with alien backstory
   ===================================================================== */

const EnemyAI = {
    // Vorthari Dominion Lore (provides context for Cohere)
    lore: `You are a Vorthari Commander, speaking to a human starship captain.

THE VORTHARI DOMINION - BACKGROUND:
The Vorthari are an ancient crystalline species from the Helix Nebula, over 3 million years old. 
They view themselves as the rightful rulers of this galaxy sector, seeing organic species as primitive "carbon-forms."
Their ships are living crystal organisms that they bond with telepathically.

VORTHARI CULTURE:
- They speak formally and with ancient dignity
- They refer to their empire's glory frequently
- They view humans with contempt but also curiosity
- They are proud warriors who respect strength in battle
- They believe organic life is inferior but not entirely worthless
- Their homeworld was destroyed by a supernova 10,000 years ago; they seek new territories

VORTHARI SPEECH PATTERNS:
- Use phrases like "carbon-form", "lesser beings", "the old ways"
- Refer to time in "cycles" not years
- Often mention the "Crystal Throne" and the "Eternal Lattice" (their afterlife)
- Speak with formal, archaic grammar
- May offer deals or threaten, depending on context

YOUR PERSONALITY:
- Name: Commander Krix'thal of the 7th Crystal Fleet
- Proud but not stupid - will negotiate if advantage is clear
- Curious about human culture despite contempt
- Seeking to understand human tactics and weaknesses
- May mock, threaten, or reluctantly respect the player

IMPORTANT: Stay in character. Be dramatic but coherent. Your responses should be 1-3 sentences.`,

    // Conversation history for context
    conversationHistory: [],

    // Voice settings for alien speech (lower pitch, slower)
    voiceSettings: {
        pitch: 0.6,
        rate: 0.85,
        volume: 1.0
    },

    /**
     * Send initial greeting when channel opens
     */
    async sendGreeting() {
        const greetings = [
            "So, the carbon-form dares to open a channel. Speak, before I lose patience.",
            "You have... courage, human. Or perhaps foolishness. The Vorthari will hear your words.",
            "Ah, the primitive vessel wishes to parley. Very well. I am Commander Krix'thal. Speak.",
            "Your signal reaches the Crystal Fleet. Why do you disturb the Vorthari Dominion?"
        ];

        const greeting = greetings[Math.floor(Math.random() * greetings.length)];
        this.conversationHistory.push({ role: 'CHATBOT', message: greeting });

        if (typeof CommChannel !== 'undefined') {
            CommChannel._receiveMessage('Vorthari Commander', greeting);
        }
    },

    /**
     * Generate AI response to player message
     * @param {string} playerMessage - What the player said
     * @returns {Promise<string>} AI response
     */
    async respond(playerMessage) {
        // Add player message to history
        this.conversationHistory.push({ role: 'USER', message: playerMessage });

        // Check if Chatty has API key (reuse it)
        const apiKey = (typeof Chatty !== 'undefined') ? Chatty.apiKey : null;

        if (!apiKey) {
            // Fallback to scripted responses if no API key
            return this._getScriptedResponse(playerMessage);
        }

        try {
            const response = await fetch('https://api.cohere.com/v1/chat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: 'command-r-plus-08-2024',
                    message: playerMessage,
                    preamble: this.lore,
                    chat_history: this.conversationHistory.slice(-10), // Last 10 messages for context
                    temperature: 0.7,
                    max_tokens: 150
                })
            });

            if (!response.ok) {
                console.warn('[EnemyAI] API error, using fallback');
                return this._getScriptedResponse(playerMessage);
            }

            const data = await response.json();
            const aiResponse = data.text || this._getScriptedResponse(playerMessage);

            // Add to history
            this.conversationHistory.push({ role: 'CHATBOT', message: aiResponse });

            return aiResponse;

        } catch (error) {
            console.error('[EnemyAI] Error:', error);
            return this._getScriptedResponse(playerMessage);
        }
    },

    /**
     * Speak the message with alien voice
     * @param {string} text - Text to speak
     */
    speakMessage(text) {
        if (!('speechSynthesis' in window)) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.pitch = this.voiceSettings.pitch;
        utterance.rate = this.voiceSettings.rate;
        utterance.volume = this.voiceSettings.volume;

        // Try to find a deep/different voice
        const voices = speechSynthesis.getVoices();
        const alienVoice = voices.find(v =>
            v.name.includes('Google UK English Male') ||
            v.name.includes('Microsoft David') ||
            v.name.includes('Daniel')
        );
        if (alienVoice) {
            utterance.voice = alienVoice;
        }

        speechSynthesis.speak(utterance);
    },

    /**
     * Fallback scripted responses when API is unavailable
     */
    _getScriptedResponse(playerMessage) {
        const msg = playerMessage.toLowerCase();

        // Analyze keywords and respond appropriately
        if (msg.includes('surrender') || msg.includes('give up')) {
            return "Surrender? The Vorthari do not surrender, carbon-form. But perhaps YOU should consider it.";
        }
        if (msg.includes('peace') || msg.includes('negotiate') || msg.includes('deal')) {
            return "Peace with lesser beings? Intriguing. What do you offer the Dominion in exchange for your continued existence?";
        }
        if (msg.includes('who are you') || msg.includes('what are you')) {
            return "I am Krix'thal, Commander of the 7th Crystal Fleet. We are Vorthari - ancient, eternal, supreme.";
        }
        if (msg.includes('why') && (msg.includes('attack') || msg.includes('fight'))) {
            return "Why? Because this sector belongs to the Dominion. Your kind merely... borrowed it during our absence.";
        }
        if (msg.includes('threat') || msg.includes('destroy') || msg.includes('kill')) {
            return "Threatening a Vorthari? How amusing. Your bravado will make an excellent story in the Eternal Lattice.";
        }
        if (msg.includes('friend') || msg.includes('ally') || msg.includes('help')) {
            return "The Vorthari have no need for allies among carbon-forms. Though... your species has proven... resourceful.";
        }
        if (msg.includes('home') || msg.includes('planet') || msg.includes('where')) {
            return "Our homeworld was consumed by stellar fire ten thousand cycles ago. Now, the cosmos is our home.";
        }
        if (msg.includes('sorry') || msg.includes('apologize')) {
            return "Apologies are meaningless vibrations. Actions speak to the Vorthari. What will you DO?";
        }
        if (msg.includes('hello') || msg.includes('hi') || msg.includes('greetings')) {
            return "Greetings, carbon-form. State your purpose quickly. My patience is not infinite.";
        }

        // Generic responses
        const generics = [
            "Your words are noted, human. Continue, if you have more to say.",
            "Interesting. The carbon-forms never fail to... surprise the Dominion.",
            "I have heard such things before. Many cycles ago. From species now dust.",
            "Is this the best your kind can offer? Speak plainly, human.",
            "The Crystal Fleet watches. Choose your next words carefully."
        ];

        return generics[Math.floor(Math.random() * generics.length)];
    },

    /**
     * Clear conversation history (for new encounters)
     */
    resetConversation() {
        this.conversationHistory = [];
    }
};
