import os
from flask import Flask, request, abort
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, TextMessage, TextSendMessage
from groq import Groq

app = Flask(__name__)

# ดึงรหัสจาก Environment Variables
line_bot_api = LineBotApi(os.getenv('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.getenv('LINE_CHANNEL_SECRET'))
groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))

# ระบบความจำ (เก็บไว้ใน Memory ของเซิร์ฟเวอร์)
# หมายเหตุ: ถ้า Restart เซิร์ฟเวอร์ ความจำจะถูกล้าง
chat_histories = {} 

SYSTEM_PROMPT = "คุณคือ 'หมวดบอส' ตำรวจไทยใจดี สุภาพ ตอบคำถามประชาชนด้วยความเต็มใจและใช้ Emoji ให้สวยงาม 🚔✨"

@app.route("/callback", methods=['POST'])
def callback():
    signature = request.headers['X-Line-Signature']
    body = request.get_data(as_text=True)
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)
    return 'OK'

@handler.add(MessageEvent, message=TextMessage)
def handle_message(event):
    user_id = event.source.user_id # ดึง ID ผู้ใช้เพื่อแยกความจำ
    user_message = event.message.text

    # 1. จัดการความจำ: ถ้าเป็นคนใหม่ ให้สร้างรายการใหม่
    if user_id not in chat_histories:
        chat_histories[user_id] = []

    # 2. สร้างข้อความที่จะส่งให้ AI (System + ประวัติ + คำถามปัจจุบัน)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # ดึงประวัติเก่ามาใส่ (เอาแค่ 5 ข้อความล่าสุดเพื่อประหยัด Token)
    for hist in chat_histories[user_id][-5:]:
        messages.append(hist)
    
    # ใส่คำถามปัจจุบัน
    messages.append({"role": "user", "content": user_message})

    try:
        # 3. ส่งให้ Groq AI ประมวลผล
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages
        )
        ai_reply = completion.choices[0].message.content
        
        # 4. บันทึกลงความจำ (เก็บทั้งคำถามเราและคำตอบ AI)
        chat_histories[user_id].append({"role": "user", "content": user_message})
        chat_histories[user_id].append({"role": "assistant", "content": ai_reply})
        
        # จำกัดความจำไม่ให้บวมเกินไป (เก็บแค่ 10 ประโยคล่าสุด)
        if len(chat_histories[user_id]) > 10:
            chat_histories[user_id] = chat_histories[user_id][-10:]

    except Exception as e:
        print(f"Error: {e}")
        ai_reply = "🚔 หมวดขออภัยครับ มีอาการเบลอนิดหน่อย รบกวนลองถามใหม่อีกครั้งนะครับ"

    line_bot_api.reply_message(event.reply_token, TextSendMessage(text=ai_reply))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
