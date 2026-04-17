import os
import PyPDF2
from flask import Flask, request, abort
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, TextMessage, TextSendMessage
from groq import Groq
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

# 1. ตั้งค่าเชื่อมต่อ API (ดึงจาก Environment Variables ใน Render)
line_bot_api = LineBotApi(os.getenv('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.getenv('LINE_CHANNEL_SECRET'))
groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))

# 2. ระบบความจำระยะสั้น (Chat History)
chat_histories = {}

# 3. ฟังก์ชันสำหรับแกะข้อความจากไฟล์ PDF
def load_law_from_pdf(file_path):
    law_sentences = []
    try:
        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                pdf_reader = PyPDF2.PdfReader(f)
                for page in pdf_reader.pages:
                    text = page.extract_text()
                    if text:
                        # ตัดข้อความออกเป็นบรรทัด หรือประโยค เพื่อให้ง่ายต่อการค้นหา
                        lines = [line.strip() for line in text.split('\n') if len(line.strip()) > 20]
                        law_sentences.extend(lines)
            print(f"📖 โหลดข้อมูลกฎหมายเรียบร้อยแล้ว: {len(law_sentences)} บรรทัด")
        else:
            print("⚠️ ไม่พบไฟล์ law_book.pdf ระบบจะทำงานโดยไม่มีฐานข้อมูลเสริม")
    except Exception as e:
        print(f"❌ Error reading PDF: {e}")
    return law_sentences

# โหลดข้อมูลกฎหมายเตรียมไว้ใน Memory ตั้งแต่ตอน Start Server
LAWS_LIST = load_law_from_pdf("law_book.pdf")

# 4. ฟังก์ชันค้นหามาตรากฎหมายที่เกี่ยวข้อง (RAG Core)
def get_relevant_laws(user_query, top_n=3):
    if not LAWS_LIST:
        return ""
    try:
        # ใช้เทคนิค TF-IDF เพื่อเปรียบเทียบความคล้ายคลึงของข้อความ
        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform(LAWS_LIST + [user_query])
        cosine_sim = cosine_similarity(tfidf_matrix[-1], tfidf_matrix[:-1])
        
        # ดึงลำดับของประโยคที่มีความคล้ายที่สุด
        top_indices = cosine_sim.argsort()[0][-top_n:][::-1]
        relevant_text = "\n".join([LAWS_LIST[i] for i in top_indices if cosine_sim[0][i] > 0.1])
        return relevant_text
    except:
        return ""

# 5. ระบบรับ Webhook จาก LINE
@app.route("/callback", methods=['POST'])
def callback():
    signature = request.headers['X-Line-Signature']
    body = request.get_data(as_text=True)
    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)
    return 'OK'

# 6. ส่วนประมวลผลข้อความและการตอบกลับ
@handler.add(MessageEvent, message=TextMessage)
def handle_message(event):
    user_id = event.source.user_id
    user_message = event.message.text

    # จัดการประวัติการสนทนา
    if user_id not in chat_histories:
        chat_histories[user_id] = []

    # --- ขั้นตอน RAG: ค้นหาข้อความใน PDF ---
    context_law = get_relevant_laws(user_message)

    # --- ขั้นตอน AI: สร้างคำตอบ ---
    system_prompt = (
        "คุณคือ 'หมวดบอส' ตำรวจไทยผู้ใจดีและรอบรู้กฎหมาย สุภาพมากและใช้ Emoji 🚔✨ "
        "จงตอบคำถามประชาชนโดยใช้ข้อมูลกฎหมายที่แนบมาให้ (ถ้ามี) "
        "หากข้อมูลในกฎหมายระบุไว้ ให้ยึดตามนั้นและบอกเลขมาตราด้วย "
        "หากไม่แน่ใจให้แนะนำให้พบพนักงานสอบสวนที่สถานีตำรวจใกล้บ้าน"
    )

    # สร้างชุดข้อความ (System + Context + History + User Message)
    messages = [{"role": "system", "content": system_prompt}]
    
    # ใส่ประวัติย้อนหลัง 3 ข้อความ (เพื่อความลื่นไหล)
    for hist in chat_histories[user_id][-3:]:
        messages.append(hist)
    
    # ใส่บริบทกฎหมายที่ค้นเจอจาก PDF เข้าไปในคำถามล่าสุด
    full_user_input = f"ข้อมูลกฎหมายที่เกี่ยวข้อง:\n{context_law}\n\nคำถาม: {user_message}"
    messages.append({"role": "user", "content": full_user_input})

    try:
        # ส่งข้อมูลทั้งหมดให้ Groq AI
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages
        )
        ai_reply = completion.choices[0].message.content
        
        # บันทึกลงประวัติการคุย
        chat_histories[user_id].append({"role": "user", "content": user_message})
        chat_histories[user_id].append({"role": "assistant", "content": ai_reply})
        
        # จำกัดขนาดความจำ (ป้องกัน Server หน่วง)
        if len(chat_histories[user_id]) > 6:
            chat_histories[user_id] = chat_histories[user_id][-6:]

    except Exception as e:
        print(f"Error calling AI: {e}")
        ai_reply = "🚔 หมวดขออภัยครับ ระบบประมวลผลขัดข้องชั่วคราว รบกวนถามหมวดอีกครั้งนะครับ"

    line_bot_api.reply_message(event.reply_token, TextSendMessage(text=ai_reply))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
