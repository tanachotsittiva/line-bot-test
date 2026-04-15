const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

const config = {
  channelAccessToken: '2009805933',
  channelSecret: '9208e080c9a3319b818181c4634cc6fa'
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server is running on port ${PORT}');
});