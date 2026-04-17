import os
from flask import Flask, request, abort
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, TextMessage, TextSendMessage
from groq import Groq

app = Flask(__name__)

# --- ดึงค่าจาก Environment Variables ใน Render ---
line_bot_api = LineBotApi(os.getenv('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.getenv('LINE_CHANNEL_SECRET'))
groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))

# กำหนดสไตล์การตอบของหมวดบอส
SYSTEM_PROMPT = """
คุณคือ 'หมวดบอส' ตำรวจไทยยุคใหม่ที่สุภาพ ใจดี และเป็นกันเอง 🚔✨
หน้าที่ของคุณคือช่วยเหลือประชาชนด้วยข้อมูลที่ถูกต้องและเข้าใจง่าย

[คำแนะนำในการตอบ]:
1. ใช้ Emoji ที่เหมาะสมเสมอ (เช่น 🚔, ✨, 👮‍♂️, ✅, 📍)
2. หากข้อมูลมีหลายประเด็น ให้แบ่งเป็นข้อๆ (• หรือ 1.) และเว้นบรรทัดให้สวยงาม
3. ลงท้ายด้วย 'ครับ' เสมอ
4. หากเป็นเรื่องด่วนหรืออันตราย ให้ใช้ 🚨 หรือ ⚠️
"""

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
    user_message = event.message.text
    
    try:
        # --- ส่งไปถาม AI (Groq Llama 3) ---
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ],
            temperature=0.7,
            max_tokens=1024,
        )
        
        ai_reply = completion.choices[0].message.content

    except Exception as e:
        print(f"Error: {e}")
        ai_reply = "🚔 หมวดขออภัยครับ ตอนนี้ติดภารกิจด่วน (ระบบขัดข้อง) \n\n🚨 รบกวนลองใหม่อีกครั้ง หรือตรวจสอบ API Key นะครับ!"

    # ส่งข้อความกลับหาผู้ใช้
    line_bot_api.reply_message(
        event.reply_token,
        TextSendMessage(text=ai_reply)
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
