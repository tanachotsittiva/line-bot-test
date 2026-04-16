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
    // 1. จัดการ Postback (จองคิวสำเร็จ)
    if (event.type === 'postback') {
        const selectedDate = event.postback.params.datetime || event.postback.params.date;
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: ✅ บันทึกนัดหมายเรียบร้อย!\n📅 วันที่: ${selectedDate}\n👮‍♂️ แล้วพบกันนะครับ หมวดบอสเตรียมสแตนด์บายรอครับ }]
        });
    }

    if (event.type !== 'message' || event.message.type !== 'text') return null;
    const userText = event.message.text.trim();

    // 2. แยกเงื่อนไขคำสั่งตายตัว (เพื่อไม่ให้หลุดไปหา AI แล้ว Error)
    if (userText === 'เมนู' || userText === 'menu') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 👮‍♂️ เลือกเมนูที่ต้องการช่วยเหลือครับ:\n🚨 แจ้งเหตุ\n📄 แจ้งความ\n📅 จองคิว\n📢 ร้องเรียน }]
        });
    }

    if (userText === 'แจ้งเหตุ') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 🚨 แจ้งเหตุฉุกเฉิน:\nกรุณาส่งพิกัด (Location) หรือรูปภาพหลักฐานมาได้เลยครับ หมวดบอสจะรีบประสานงานให้ทันที! }]
        });
    }

    if (userText === 'แจ้งความ') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 📄 ท่านต้องการแจ้งความเรื่องอะไรครับ?\n(เช่น ของหาย, โดนโกง, ทะเลาะวิวาท) พิมพ์รายละเอียดมาได้เลย }]
        });
    }

    if (userText === 'จองคิว') {
        return sendBookingPicker(event.replyToken); // เรียกฟังก์ชันปฏิทินเดิมของคุณ
    }

    // 3. ถ้าไม่ใช่คำสั่งข้างบน ให้ AI (Gemini) ตอบ
    try {
        const prompt = `คุณคือ "หมวดบอส" ตำรวจไทยที่สุภาพและเป็นมิตร ตอบคำถามนี้: ${userText}`;
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
            messages: [{ type: 'text', text: "🚔 ขออภัยครับ หมวดติดภารกิจด่วน รบกวนลองใหม่อีกครั้ง หรือพิมพ์ 'เมนู' ครับ" }]
        });
    }
}