require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.post('/webhook', line.middleware(config), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

async function handleEvent(event) {
    // --- 1. จัดการการเลือกวันที่ (Postback) ---
    if (event.type === 'postback') {
        const selectedDate = event.postback.params.datetime || event.postback.params.date;
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `✅ บันทึกนัดหมายเรียบร้อย!\n📅 วันที่: ${selectedDate}\n👮‍♂️ แล้วพบกันนะครับ หมวดบอสเตรียมสแตนด์บายรอครับ` }]
        });
    }

    // --- 2. จัดการรูปภาพ (Image) ---
    if (event.type === 'message' && event.message.type === 'image') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: '📸 ได้รับรูปภาพหลักฐานเรียบร้อยครับ! \n🕵️‍♂️ หมวดบอสจะรีบส่งเรื่องตรวจสอบให้ทันทีครับ' }]
        });
    }

    // --- 3. จัดการพิกัด (Location) ---
    if (event.type === 'message' && event.message.type === 'location') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `📍 ได้รับพิกัดแจ้งเหตุแล้ว!\n🏠 สถานที่: ${event.message.address}\n🚔 กำลังประสานรถสายตรวจที่ใกล้ที่สุดให้ครับ!` }]
        });
    }

    // --- 4. จัดการข้อความ (Text) ---
    if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();
        
        // --- เมนูหลัก ---
        if (userText === 'เมนู' || userText === 'menu') {
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ 
                    type: 'text', 
                    text: `👮‍♂️ สวัสดีครับ! ผม "หมวดบอส" ยินดีรับใช้ประชาชนครับ\n\nกรุณาเลือกเมนูที่ต้องการช่วยเหลือ:\n🚨 1. แจ้งเหตุ (ส่งรูป/พิกัดมาได้เลย)\n🗓️ 2. จองคิวเข้าพบ\n📑 3. ร้องเรียนการทำงาน\n\nหรือพิมพ์คุยกับผมได้โดยตรงเลยครับ ✨` 
                }]
            });
        }

        // --- ระบบปฏิทินจองคิว ---
        if (userText === 'จองคิว') {
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'template',
                    altText: 'กรุณาเลือกวันเวลาเข้าพบ',
                    template: {
                        type: 'buttons',
                        thumbnailImageUrl: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&q=80&w=500', // รูปตัวอย่างปฏิทิน
                        title: '📅 นัดหมายเข้าพบ',
                        text: 'กรุณากดปุ่มด้านล่างเพื่อเลือกวันและเวลาครับ',
                        actions: [{
                            type: 'datetimepicker',
                            label: 'เลือกวัน/เวลา 🕒',
                            data: 'action=booking',
                            mode: 'datetime'
                        }]
                    }
                }]
            });
        }

        // --- ระบบ AI (Gemini) ---
        try {
            const prompt = `คุณคือ "หมวดบอส" ตำรวจไทยผู้ช่วยประชาชนที่แสนดี สุภาพ ขี้เล่นเล็กน้อยและใช้อีโมจิเก่ง 
            ตอบคำถามนี้: "${userText}" 
            (คำแนะนำ: ใช้ภาษาที่เป็นกันเอง ใส่ใจประชาชน และปิดท้ายด้วยความเต็มใจช่วย)`;
            
            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: 'text', text: response.text() }]
            });
        } catch (error) {
            console.error("AI Error:", error);
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: 'text', text: "🚔 หมวดบอสขออภัยครับ ตอนนี้สัญญาณวิทยุขัดข้อง รบกวนลองใหม่อีกครั้งนะครับ!" }]
            });
        }
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 หมวดบอสออนไลน์บนพอร์ต ${PORT}`));
