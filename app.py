import os
import base64
import PyPDF2
from flask import Flask, request, abort
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, TextMessage, TextSendMessage, ImageMessage
from groq import Groq
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

# --- 1. ตั้งค่าการเชื่อมต่อ API ---
line_bot_api = LineBotApi(os.getenv('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.getenv('LINE_CHANNEL_SECRET'))
groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))

# --- 2. ระบบความจำและฐานข้อมูล ---
chat_histories = {}
LAWS_LIST = []

def load_law_from_pdf(file_path):
    sentences = []
    try:
        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                pdf_reader = PyPDF2.PdfReader(f)
                for page in pdf_reader.pages:
                    text = page.extract_text()
                    if text:
                        # แยกเป็นบรรทัดและกรองบรรทัดที่สั้นเกินไปออก
                        lines = [l.strip() for l in text.split('\n') if len(l.strip()) > 20]
                        sentences.extend(lines)
            print(f"📖 โหลดกฎหมายสำเร็จ: {len(sentences)} บรรทัด")
        else:
            print("⚠️ ไม่พบไฟล์ law_book.pdf")
    except Exception as e:
        print(f"❌ Error loading PDF: {e}")
    return sentences

# โหลด PDF เข้า Memory ทันทีที่รันโปรแกรม
LAWS_LIST = load_law_from_pdf("law_book.pdf")

# --- 3. ฟังก์ชันเสริม (Helper Functions) ---

def get_relevant_laws(query):
    """ ค้นหามาตราที่เกี่ยวข้องจาก PDF """
    if not LAWS_LIST: return ""
    try:
        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform(LAWS_LIST + [query])
        cosine_sim = cosine_similarity(tfidf_matrix[-1], tfidf_matrix[:-1])
        top_indices = cosine_sim.argsort()[0][-3:][::-1]
        return "\n".join([LAWS_LIST[i] for i in top_indices if cosine_sim[0][i] > 0.1])
    except:
        return ""

def encode_image(image_path):
    """ แปลงรูปเป็น Base64 สำหรับ Groq Vision """
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

# --- 4. เส้นทาง Webhook สำหรับ LINE ---

@app.route("/callback", methods=['POST'])
def callback():
    signature = request.headers['X-Line-Signature']
    body = request.get_data(as_text=True)
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)
    return 'OK'

# --- 5. จัดการเมื่อได้รับ "ข้อความตัวอักษร" (AI + RAG + Memory) ---

@handler.add(MessageEvent, message=TextMessage)
def handle_text(event):
    user_id = event.source.user_id
    user_message = event.message.text

    if user_id not in chat_histories:
        chat_histories[user_id] = []

    # ค้นหากฎหมายที่เกี่ยวข้อง
    context_law = get_relevant_laws(user_message)

    system_prompt = (
        "คุณคือ 'หมวดบอส' ตำรวจไทยใจดี สุภาพมาก และรอบรู้กฎหมาย 🚔✨ "
        "จงใช้ข้อมูลกฎหมายที่แนบมาประกอบการตอบ (ถ้ามี) พร้อมระบุเลขมาตรา "
        "หากไม่แน่ใจให้แนะนำให้ติดต่อสถานีตำรวจใกล้บ้าน"
    )

    messages = [{"role": "system", "content": system_prompt}]
    
    # ใส่ประวัติการคุยล่าสุด 3 ประโยค
    for hist in chat_histories[user_id][-3:]:
        messages.append(hist)
    
    # รวมคำถามกับข้อมูลกฎหมาย
    full_input = f"ข้อมูลกฎหมาย:\n{context_law}\n\nคำถาม: {user_message}"
    messages.append({"role": "user", "content": full_input})

    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages
        )
        ai_reply = completion.choices[0].message.content
        
        # บันทึกความจำ
        chat_histories[user_id].append({"role": "user", "content": user_message})
        chat_histories[user_id].append({"role": "assistant", "content": ai_reply})
    except:
        ai_reply = "🚔 หมวดเบลอนิดหน่อย รบกวนถามอีกครั้งนะครับ"

    line_bot_api.reply_message(event.reply_token, TextSendMessage(text=ai_reply))

# --- 6. จัดการเมื่อได้รับ "รูปภาพ" (AI Vision) ---

@handler.add(MessageEvent, message=ImageMessage)
def handle_image(event):
    message_id = event.message.id
    message_content = line_bot_api.get_message_content(message_id)
    temp_path = f"{message_id}.jpg"

    with open(temp_path, 'wb') as f:
        for chunk in message_content.iter_content():
            f.write(chunk)

    try:
        base64_image = encode_image(temp_path)
        response = groq_client.chat.completions.create(
            model="llama-3.2-11b-vision-preview", # ใช้โมเดลดูรูปของ Groq
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "หมวดบอสครับ ช่วยวิเคราะห์รูปนี้ในเชิงกฎหมายและให้คำแนะนำด้วยความสุภาพครับ 🚔✨"},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                    ]
                }
            ]
        )
        ai_reply = response.choices[0].message.content
    except:
        ai_reply = "🚔 หมวดมองรูปไม่ชัดเลย รบกวนส่งใหม่อีกครั้งนะครับ"
    finally:
        if os.path.exists(temp_path): os.remove(temp_path)

    line_bot_api.reply_message(event.reply_token, TextSendMessage(text=ai_reply))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
