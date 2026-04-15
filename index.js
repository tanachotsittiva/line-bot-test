require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// สร้าง Client แบบเวอร์ชั่นใหม่
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userText = event.message.text.trim();

  // สร้างตัวแปรสำหรับข้อความที่จะตอบกลับ
  let replyText = '';

  if (userText === 'เมนู' || userText === 'menu') {
    replyText = `กรุณาเลือกเมนู:\n1. แจ้งเหตุ\n2. แจ้งความ\n3. ตรวจสอบคดี\n4. จองคิว\n5. ร้องเรียน`;
  } else if (userText === 'แจ้งเหตุ') {
    replyText = `กรุณาระบุรายละเอียด:\n- สถานที่\n- เวลา\n- เหตุการณ์\n📍 ส่งโลเคชันและรูปภาพได้`;
  } else if (userText === 'แจ้งความ') {
    replyText = `เลือกประเภท:\n1. ของหาย\n2. ถูกโกงออนไลน์\n3. เอกสารหาย`;
  } else if (userText.startsWith('คดี')) {
    replyText = `🔎 สถานะคดี:\nอยู่ระหว่างสอบสวน\nเจ้าหน้าที่: ร.ต.อ.สมชาย`;
  } else {
    replyText = `คุณพิมพ์ว่า: ${userText}\nพิมพ์ "เมนู" เพื่อเริ่มใช้งาน`;
  }

  // การส่งข้อความแบบเวอร์ชั่นใหม่ (ต้องมี messages เป็น Array)
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: replyText
    }]
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
