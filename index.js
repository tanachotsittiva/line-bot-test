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

// เชื่อมต่อสมอง AI Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

app.post('/webhook', line.middleware(config), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

async function handleEvent(event) {
    // 1. จัดการปฏิทินจองคิว (Postback)
    if (event.type === 'postback') {
        const selectedDate = event.postback.params.datetime || event.postback.params.date;
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `✅ บันทึกนัดหมายสำเร็จ!\n📅 วันที่นัด: ${selectedDate}\n👮‍♂️ หมวดบอสเตรียมรอพบท่านตามเวลาครับ` }]
        });
    }

    // รับเฉพาะข้อความตัวอักษร
    if (event.type !== 'message' || event.message.type !== 'text') return null;
    const userText = event.message.text.trim();

    // 2. ระบบเมนูหลัก (ใช้ if / else if เพื่อความแม่นยำ)
    if (userText === 'เมนู' || userText === 'menu') {
        const menuMsg = `👮‍♂️ สวัสดีครับ! เลือกบริการที่ต้องการช่วยเหลือครับ:\n\n🚨 1. แจ้งเหตุ (ส่งพิกัด/รูปมาได้เลย)\n📄 2. แจ้งความ (ดูขั้นตอนการแจ้ง)\n📅 3. จองคิว (เลือกเวลาเข้าพบ)\n📢 4. ร้องเรียน\n\n✨ หรือคุยกับหมวดบอสได้เลยครับ`;
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: menuMsg }]
        });
    } 
    else if (userText === 'แจ้งความ') {
        const reportMsg = `📄 **ขั้นตอนการแจ้งความ**\n\n1️⃣ เตรียมบัตรประชาชนและหลักฐาน\n2️⃣ แจ้งรายละเอียดเหตุการณ์ที่เกิดขึ้น\n3️⃣ ท่านสามารถพิมพ์รายละเอียดทิ้งไว้ที่นี่\n\n🕵️‍♂️ หรือกดเมนู "จองคิว" เพื่อเข้ามาพบหมวดบอสที่สถานีได้ครับ`;
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: reportMsg }]
        });
    }
    else if (userText === 'แจ้งเหตุ') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `🚨 **แจ้งเหตุฉุกเฉิน**\nกรุณาส่งพิกัด📍 หรือรูปภาพ📸 มาได้เลยครับ หมวดบอสจะรีบประสานงานให้ทันที!` }]
        });
    }
    else if (userText === 'จองคิว') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'template',
                altText: 'กรุณาเลือกวันเวลาเข้าพบ',
                template: {
                    type: 'buttons',
                    title: '📅 นัดหมายเข้าพบ',
                    text: 'กรุณาเลือกวันและเวลาที่สะดวกครับ',
                    actions: [{ type: 'datetimepicker', label: 'เลือกวัน/เวลา 🕒', data: 'action=booking', mode: 'datetime' }]
                }
            }]
        });
    }
    // 3. ถ้าไม่ใช่คำสั่งเมนู ให้ AI (Gemini) เป็นคนตอบ
    else {
        try {
            const prompt = `คุณคือ "หมวดบอส" ตำรวจไทยที่สุภาพ ใจดี และใช้อีโมจิเก่ง ตอบประชาชนคนนี้: ${userText}`;
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
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 หมวดบอสออนไลน์บนพอร์ต ${PORT}`));
