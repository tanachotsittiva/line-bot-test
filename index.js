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

// ตั้งค่า AI Gemini
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
    // --- 1. ระบบบันทึกนัดหมาย (Postback จากปฏิทิน) ---
    if (event.type === 'postback') {
        const selectedDate = event.postback.params.datetime || event.postback.params.date;
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ 
                type: 'text', 
                text: `✅ บันทึกนัดหมายสำเร็จ!\n📅 วันที่นัด: ${selectedDate}\n👮‍♂️ หมวดบอสเตรียมสแตนด์บายรอพบท่านตามเวลานัดครับ` 
            }]
        });
    }

    // --- 2. ระบบรับหลักฐาน (รูปภาพ/พิกัด) ---
    if (event.type === 'message' && event.message.type === 'image') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: '📸 ได้รับรูปภาพหลักฐานเรียบร้อยครับ!\n🕵️‍♂️ หมวดบอสจะรีบประสานงานฝ่ายที่เกี่ยวข้องให้ทันที' }]
        });
    }

    if (event.type === 'message' && event.message.type === 'location') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `📍 ได้รับพิกัดแจ้งเหตุแล้ว!\n🏠 ที่อยู่: ${event.message.address}\n🚔 กำลังวิทยุแจ้งรถสายตรวจที่ใกล้ที่สุดให้ครับ` }]
        });
    }

    // --- 3. ระบบจัดการข้อความ (Text Message) ---
    if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();

        // เมนู: เรียกดูรายการทั้งหมด
        if (userText === 'เมนู' || userText === 'menu') {
            const menuText = `👮‍♂️ สวัสดีครับ! ผม "หมวดบอส" ยินดีรับใช้ประชาชนครับ\n\n` +
                             `กรุณาเลือกบริการที่ต้องการช่วยเหลือ:\n` +
                             `🚨 1. แจ้งเหตุ (ส่งรูปหรือพิกัดมาได้เลย)\n` +
                             `📄 2. แจ้งความ (ระบุเรื่องที่โดนกระทำ)\n` +
                             `📅 3. จองคิว (เลือกวันเวลาเข้าพบ)\n` +
                             `📢 4. ร้องเรียนการปฏิบัติงาน\n\n` +
                             `✨ หรือพิมพ์พูดคุยกับผมได้โดยตรงเลยครับ`;
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: 'text', text: menuText }]
            });
        }

        // เมนู: แจ้งเหตุ
        if (userText === 'แจ้งเหตุ') {
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: 'text', text: '🚨 แจ้งเหตุฉุกเฉิน:\nกรุณากดปุ่ม "+" แล้วเลือก "Location" เพื่อส่งพิกัด หรือส่งรูปภาพเหตุการณ์มาได้เลยครับ' }]
            });
        }

        // เมนู: จองคิว (แสดงปฏิทิน)
        if (userText === 'จองคิว') {
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'template',
                    altText: 'กรุณาเลือกวันเวลาเข้าพบ',
                    template: {
                        type: 'buttons',
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

        // --- ระบบ AI: ถ้าไม่ใช่คำสั่งเมนู ให้ Gemini ตอบกลับ ---
        try {
            const prompt = `คุณคือ "หมวดบอส" ตำรวจไทยผู้ช่วยประชาชนที่สุภาพ เป็นกันเอง และใช้อีโมจิเก่ง ตอบคำถามนี้: "${userText}"`;
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
                messages: [{ type: 'text', text: "🚔 ขออภัยครับ สัญญาณวิทยุขัดข้อง รบกวนลองใหม่อีกครั้ง หรือพิมพ์ 'เมนู' ครับ" }]
            });
        }
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 หมวดบอสออนไลน์บนพอร์ต ${PORT}`));
