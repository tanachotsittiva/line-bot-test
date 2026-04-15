require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({channelAccessToken:config.channelAccessToken});

// Webhook endpoint
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result));
});

// ฟังก์ชันหลัก
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userText = event.message.text;

  // เมนูหลัก
  if (userText === 'เมนู' || userText === 'menu') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `กรุณาเลือกเมนู:
1. แจ้งเหตุ
2. แจ้งความ
3. ตรวจสอบคดี
4. จองคิว
5. ร้องเรียน`
    });
  }

  // แจ้งเหตุ
  if (userText === 'แจ้งเหตุ') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `กรุณาระบุรายละเอียด:
- สถานที่
- เวลา
- เหตุการณ์

📍 ส่งโลเคชันและรูปภาพได้`
    });
  }

  // แจ้งความ
  if (userText === 'แจ้งความ') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `เลือกประเภท:
1. ของหาย
2. ถูกโกงออนไลน์
3. เอกสารหาย`
    });
  }

  // ตรวจสอบคดี
  if (userText.startsWith('คดี')) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `🔎 สถานะคดี:
อยู่ระหว่างสอบสวน
เจ้าหน้าที่: ร.ต.อ.สมชาย`
    });
  }

  // จองคิว
  if (userText === 'จองคิว') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `เลือกบริการ:
1. แจ้งความ
2. ขอใบรับรองความประพฤติ`
    });
  }

  // ร้องเรียน
  if (userText === 'ร้องเรียน') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `กรุณาระบุรายละเอียดร้องเรียน
📎 แนบหลักฐานได้`
    });
  }

  // Default
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: 'พิมพ์ "เมนู" เพื่อเริ่มใช้งาน'
  });
}

 const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});