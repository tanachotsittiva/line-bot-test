import os
import base64
from flask import Flask, request, abort
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, TextMessage, TextSendMessage, ImageMessage
from groq import Groq
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

# --- 1. ตั้งค่า API ---
line_bot_api = LineBotApi(os.getenv('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.getenv('LINE_CHANNEL_SECRET'))
groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))

chat_histories = {}
LAWS_LIST = []

# --- 2. ฟังก์ชันแปลงเลขไทย <-> อารบิก ---
def convert_numbers(text, to_arabic=True):
    thai_num = "๐๑๒๓๔๕๖๗๘๙"
    ara_num = "0123456789"
    if to_arabic:
        table = str.maketrans(thai_num, ara_num)
    else:
        table = str.maketrans(ara_num, thai_num)
    return text.translate(table)

# --- 3. ฟังก์ชันโหลดกฎหมายจาก .txt ---
def load_law_data(file_path):
    data = []
    try:
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                for line in f:
                    if len(line.strip()) > 5:
                        # เก็บทั้งแบบเดิมและแบบแปลงเลขเพื่อให้ค้นหาง่ายขึ้น
                        data.append(line.strip())
            print(f"📖 หมวดบอสโหลดกฎหมายเรียบร้อย: {len(data)} มาตรา")
        else:
            print("⚠️ ไม่พบไฟล์ law_data.txt")
    except Exception as e:
        print(f"❌ โหลดไฟล์พลาด: {e}")
    return data

LAWS_LIST = load_law_data("law_data.txt")

# --- 4. ฟังก์ชันค้นหากฎหมาย (RAG) ---
def get_relevant_laws(query):
    if not LAWS_LIST: return ""
    try:
        # แปลงคำถามให้เป็นเลขสากลก่อนค้นหา
        clean_query = convert_numbers(query)
        # ทำสำเนาฐานข้อมูลที่แปลงเป็นเลขสากลเพื่อใช้ Match
        search_list = [convert_numbers(l) for l in LAWS_LIST]
        
        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform(search_list + [clean_query])
        cosine_sim = cosine_similarity(tfidf_matrix[-1], tfidf_matrix[:-1])
        
        # ปรับเหลือแค่ 1-2 มาตราที่คะแนนสูงที่สุดเท่านั้น
        top_indices = cosine_sim.argsort()[0][-2:][::-1]
        
        # เพิ่มความเข้มงวดของคะแนน (Threshold) จาก 0.1 เป็น 0.3
        results = [LAWS_LIST[i] for i in top_indices if cosine_sim[0][i] > 0.3]
        return "\n\n".join(results)
    except:
        return ""

# --- 5. จัดการ Webhook ---
@app.route("/callback", methods=['POST'])
def callback():
    signature = request.headers['X-Line-Signature']
    body = request.get_data(as_text=True)
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)
    return 'OK'

# --- 6. เมื่อได้รับ "ข้อความ" ---
@handler.add(MessageEvent, message=TextMessage)
def handle_text(event):
    user_id = event.source.user_id
    user_msg = event.message.text

    if user_id not in chat_histories:
        chat_histories[user_id] = []

    context_law = get_relevant_laws(user_msg)

    system_prompt = (
        "คุณคือ 'หมวดบอส' ตำรวจไทยใจดี สุภาพ และรอบรู้กฎหมาย 🚔✨ "
        "หน้าที่ของคุณคือตอบคำถามประชาชนด้วยความเต็มใจ "
        "1. ต้องมีอีโมจิเสมอเพื่อให้ดูเป็นมิตร 😊 "
        "2. จัดรูปแบบข้อความให้อ่านง่าย เว้นบรรทัดให้สวยงาม "
        "3. หากมีข้อมูลกฎหมายที่แนบไปให้ ให้สรุปและอ้างอิงเลขมาตราด้วย 📄 "
        "4. หากไม่ทราบแน่ชัด ให้แนะนำให้ติดต่อ สน. ใกล้บ้านด้วยความสุภาพครับ"
        "5. ใช้เฉพาะข้อกฎหมายที่แนบไปให้เท่านั้นในการระบุเลขมาตรา\n"
        "6. 'ห้าม' สร้างเลขมาตราหรือเนื้อหากฎหมายขึ้นมาเองเด็ดขาด,หากในข้อมูลไม่มี ให้ตอบว่า 'เรื่องนี้หมวดยังไม่มีข้อมูลแน่ชัดครับ'\n"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for hist in chat_histories[user_id][-3:]:
        messages.append(hist)
    
    full_input = f"ข้อมูลกฎหมายที่ค้นเจอ:\n{context_law}\n\nคำถามจากประชาชน: {user_msg}"
    messages.append({"role": "user", "content": full_input})

    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages
        )
        ai_reply = completion.choices[0].message.content
        chat_histories[user_id].append({"role": "user", "content": user_msg})
        chat_histories[user_id].append({"role": "assistant", "content": ai_reply})
    except:
        ai_reply = "🚔 หมวดขออภัยครับ ระบบขัดข้องนิดหน่อย รบกวนถามอีกครั้งนะครับ ✨"

    line_bot_api.reply_message(event.reply_token, TextSendMessage(text=ai_reply))

# --- 7. เมื่อได้รับ "รูปภาพ" ---
@handler.add(MessageEvent, message=ImageMessage)
def handle_image(event):
    message_id = event.message.id
    content = line_bot_api.get_message_content(message_id)
    temp_path = f"{message_id}.jpg"

    with open(temp_path, 'wb') as f:
        for chunk in content.iter_content():
            f.write(chunk)

    try:
        with open(temp_path, "rb") as img_f:
            base64_img = base64.b64encode(img_f.read()).decode('utf-8')

        response = groq_client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "หมวดบอสครับ ช่วยวิเคราะห์รูปนี้ในเชิงกฎหมายทีครับ สรุปให้อ่านง่าย สุภาพ และมีอีโมจิด้วยนะ 🚔✨"},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}}
                ]
            }]
        )
        ai_reply = response.choices[0].message.content
    except:
        ai_reply = "🚔 หมวดมองรูปไม่ชัดเลยครับ รบกวนส่งใหม่อีกครั้งนะครับ ✨"
    finally:
        if os.path.exists(temp_path): os.remove(temp_path)

    line_bot_api.reply_message(event.reply_token, TextSendMessage(text=ai_reply))

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)))
