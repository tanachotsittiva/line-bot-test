require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

// ตั้งค่ารหัสผ่าน (ดึงมาจาก Environment Variables ใน Render)
const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

// สร้าง Client สำหรับเชื่อมต่อกับ LINE
const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
});

// ส่วนของ Webhook สำหรับรับข้อความจาก LINE
app.post('/webhook', line.middleware(config), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error('Error at webhook:', err);
            res.status(500).end();
        });
});

// ฟังก์ชันหลักในการจัดการข้อความ
async function handleEvent(event) {
    // รับเฉพาะข้อความที่เป็น Text (ตัวอักษร)
    if (event.type !== 'message' || event.message.type !== 'text') {
        return null;
    }

    const userText = event.message.text.trim();
    let replyText = "";

    // ระบบ Logic: ใช้ if / else if เพื่อให้เลือกตอบเพียงอย่างเดียว
    if (userText === 'เมนู' || userText === 'menu' || userText === 'Menu') {
        replyText = `ยินดีต้อนรับครับหมวดบอสยินดีรับใช้
กรุณาเลือกเมนูที่ต้องการ:
1. แจ้งเหตุ
2. แจ้งความ
3. ตรวจสอบคดี
4. จองคิว
5. ร้องเรียน`;
    } 
    else if (userText === 'แจ้งเหตุ' || userText === '1') {
        replyText = `🚨 แจ้งเหตุฉุกเฉิน:
กรุณาระบุรายละเอียดเหตุการณ์ และส่งตำแหน่งที่เกิดเหตุ (Location) หรือรูปภาพหลักฐานมาได้เลยครับ`;
    } 
    else if (userText === 'แจ้งความ' || userText === '2') {
        replyText = `📄 บริการแจ้งความ:
ท่านต้องการแจ้งความเรื่องใดครับ?
- ของหาย
- ถูกโกงออนไลน์
- ทะเลาะวิวาท`;
    } 
    else if (userText === 'ตรวจสอบคดี' || userText === '3') {
        replyText = `🔎 ตรวจสอบคดี:
กรุณาพิมพ์หมายเลขคดี หรือชื่อผู้แจ้ง เพื่อดำเนินการตรวจสอบครับ`;
    } 
    else if (userText === 'จองคิว' || userText === '4') {
        replyText = `📅 จองคิวเข้าพบ:
กรุณาระบุ วัน/เดือน/เวลา ที่ต้องการ และระบุชื่อเจ้าหน้าที่ที่ต้องการเข้าพบครับ`;
    } 
    else if (userText === 'ร้องเรียน' || userText === '5') {
        replyText = `📢 ร้องเรียนการปฏิบัติงาน:
กรุณาระบุรายละเอียดข้อร้องเรียนของท่าน ข้อมูลนี้จะถูกเก็บเป็นความลับครับ`;
    } 
    else {
        // กรณีพิมพ์คำอื่นๆ ที่ไม่มีในเมนู
        replyText = `ขออภัยครับ ผมไม่เข้าใจคำสั่ง "${userText}" 
กรุณาพิมพ์คำว่า "เมนู" เพื่อดูรายการที่ต้องการครับ`;
    }

    // ส่งข้อความตอบกลับหาผู้ใช้
    return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
            type: 'text',
            text: replyText
        }]
    });
}

// ตั้งค่า Port สำหรับ Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
