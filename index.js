const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ==================== KONFIGURASI LU (GANTI DI SINI) ====================
const GREEN_API_ID_INSTANCE = '7107649306l'
const GREEN_API_TOKEN = 'bb842122ad45431e8e3657f5c15c22d210c29b7ff92641e384'            
const COZE_API_TOKEN = 'pat_aUbnKo9sovGOUK5qwVvsBYcG2I604nUsPI9919juSaPpc4BzdqK2cjj6C66V7D3j'     // Personal Access Token dari Coze
const COZE_BOT_ID = '7650012694732488709'                       
// ========================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        if (body.typeWebhook === 'incomingMessageReceived' && body.messageData?.typeMessage === 'textMessage') {
            
            const chatId = body.senderData.chatId; 
            const userMessage = body.messageData.textMessageData.textMessage; 
            
            console.log(`[WA] Pesan masuk dari ${chatId}: "${userMessage}"`);

            // 1. Tembak ke Coze API v3
            const cozeChatResponse = await axios.post(
                'https://api.coze.com/v3/chat',
                {
                    bot_id: COZE_BOT_ID,
                    user_id: chatId.replace('@c.us', ''), 
                    additional_messages: [
                        {
                            role: 'user',
                            content: userMessage,
                            content_type: 'text'
                        }
                    ]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${COZE_API_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const chatIdCoze = cozeChatResponse.data.data.id;
            const conversationId = cozeChatResponse.data.data.conversation_id;

            // 2. Polling Status Coze v3
            let status = 'in_progress';
            let attempts = 0;
            
            while ((status === 'in_progress' || status === 'created') && attempts < 10) {
                await sleep(1500); 
                
                const checkStatus = await axios.get(
                    `https://api.coze.com/v3/chat/retrieve?chat_id=${chatIdCoze}&conversation_id=${conversationId}`,
                    { headers: { 'Authorization': `Bearer ${COZE_API_TOKEN}` } }
                );
                
                status = checkStatus.data.data.status;
                attempts++;
            }

            // 3. Ambil jawaban Damayanti
            if (status === 'completed') {
                const messageList = await axios.post(
                    `https://api.coze.com/v3/chat/message/list?chat_id=${chatIdCoze}&conversation_id=${conversationId}`,
                    {},
                    { headers: { 'Authorization': `Bearer ${COZE_API_TOKEN}` } }
                );

                const botMessages = messageList.data.data.filter(msg => msg.role === 'assistant' && msg.type === 'answer');
                
                if (botMessages.length > 0) {
                    const damayantiReply = botMessages[0].content;
                    console.log(`[Coze] Jawaban Damayanti: "${damayantiReply}"`);

                    // 4. Kirim balik ke WA via Green API
                    await axios.post(
                        `https://api.green-api.com/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN}`,
                        {
                            chatId: chatId,
                            message: damayantiReply
                        }
                    );
                    console.log(`[WA] Balasan berhasil dikirim ke ${chatId}`);
                }
            } else {
                console.log('[Error] Coze timeout / gagal merespon tepat waktu.');
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error di Webhook:', error.response?.data || error.message);
        res.status(200).send('OK'); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server Jembatan Damayanti jalan di port ${PORT}`);
});
