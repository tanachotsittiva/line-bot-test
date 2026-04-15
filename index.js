require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();
const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
});

app.post('/webhook', line.middleware(config), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => res.status(500).end());
});

async function handleEvent(event) {
    // 1. จัดการการเลือกวันที่/เวลา (Postback)
    if (event.type === 'postback') {
        const data = event.postback.params;
        const selectedDateTime = data.datetime || data.date || data.time;
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `หมวดบอสได้รับคิวจองวันที่: ${selectedDateTime} เรียบร้อยแล้วครับ` }]
        });
    }

    // 2. จัดการรูปภาพ (Image)
    if (event.type === 'message' && event.message.type === 'image') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 'ได้รับรูปภาพหลักฐานแล้วครับ กำลังดำเนินการตรวจสอบ...' }]
        });
    }

    // 3. จัดการพิกัด (Location)
    if (event.type === 'message' && event.message.type === 'location') {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `ได้รับพิกัดแจ้งเหตุที่: ${event.message.address} แล้วครับ เจ้าหน้าที่กำลังไปตรวจสอบ` }]
        });
    }

    // 4. จัดการข้อความ (Text)
    if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text.trim();

        if (userText === 'เมนู') {
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: 'text', text: 'กรุณาเลือกเมนู: แจ้งเหตุ, แจ้งความ, หรือ จองคิว' }]
            });
        }

        if (userText === 'จองคิว') {
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'template',
                    altText: 'กรุณาเลือกวันเวลาเข้าพบ',
                    template: {
                        type: 'buttons',
                        text: 'กรุณาเลือกวันและเวลาที่สะดวกเข้าพบเจ้าหน้าที่ครับ',
                        actions: [{
                            type: 'datetimepicker',
                            label: 'เลือกวัน/เวลา',
                            data: 'action=booking',
                            mode: 'datetime' // เลือกได้ทั้งวันที่และเวลา
                        }]
                    }
                }]
            });
        }
        
        if (userText === 'แจ้งเหตุ') {
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: 'text', text: '🚨 กรุณากดปุ่ม + แล้วเลือก "Location" เพื่อส่งพิกัด หรือส่งรูปภาพเหตุการณ์มาได้เลยครับ' }]
            });
        }
    }
    return null;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
