const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

const config = {
  channelAccessToken: 'ใส่_ACCESS_TOKEN_ตรงนี้',
  channelSecret: 'ใส่_SECRET_ตรงนี้'
};

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(() => res.end())
    .catch(err => console.error(err));
});

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const client = new line.Client(config);

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: 'คุณพิมพ์ว่า: ' + event.message.text
  });
}

app.listen(port, () => {
  console.log('Server is running on port ${PORT}');
});