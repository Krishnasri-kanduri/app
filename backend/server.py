from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import aiofiles
import json
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
import asyncio
import random


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Create uploads directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Define Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    credits: int = 100
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    name: str
    email: str

class ResearchQuestion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    question: str
    files: List[str] = []
    status: str = "pending"  # pending, processing, completed, failed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ResearchReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    question_id: str
    user_id: str
    report: str
    citations: List[str] = []
    sources_used: List[str] = []
    live_data_included: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NewsItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    source: str
    published_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Mock news data for live updates
MOCK_NEWS = [
    {
        "title": "AI Research Breakthrough: New Language Models Show Enhanced Reasoning",
        "content": "Recent studies demonstrate significant improvements in AI reasoning capabilities, with new models showing 40% better performance in complex problem-solving tasks.",
        "source": "TechResearch Daily"
    },
    {
        "title": "Global Education Technology Market Reaches $400B",
        "content": "The EdTech market continues to expand rapidly, driven by increased digital adoption and remote learning initiatives worldwide.",
        "source": "Education Tech News"
    },
    {
        "title": "Sustainability in Tech: Green Computing Initiatives Show Promise",
        "content": "Major tech companies report 30% reduction in carbon footprint through innovative green computing solutions and renewable energy adoption.",
        "source": "GreenTech Report"
    },
    {
        "title": "Cybersecurity Alert: New Phishing Techniques Target Remote Workers",
        "content": "Security experts warn of sophisticated phishing campaigns specifically designed to exploit remote work vulnerabilities.",
        "source": "CyberSecurity Weekly"
    },
    {
        "title": "Medical AI: Diagnostic Accuracy Reaches 95% in Clinical Trials",
        "content": "Latest medical AI systems demonstrate unprecedented accuracy in diagnostic imaging, potentially revolutionizing healthcare delivery.",
        "source": "Medical Innovation Journal"
    }
]

# Initialize Gemini chat
async def get_gemini_chat():
    return LlmChat(
        api_key=os.environ.get('EMERGENT_LLM_KEY'),
        session_id="research-assistant",
        system_message="""You are a Smart Research Assistant. Your role is to:
1. Analyze uploaded files and live data sources
2. Generate concise, evidence-based research reports (2-3 paragraphs)
3. Always include specific citations and sources
4. Focus on key insights and actionable information
5. Maintain academic rigor while being accessible

Format your responses as structured reports with:
- Key Findings (main insights)
- Supporting Evidence (with citations)
- Sources Used (list all sources referenced)"""
    ).with_model("gemini", "gemini-2.0-flash")

# Routes

@api_router.get("/")
async def root():
    return {"message": "Smart Research Assistant API"}

@api_router.post("/users", response_model=User)
async def create_user(user: UserCreate):
    user_dict = user.dict()
    user_obj = User(**user_dict)
    await db.users.insert_one(user_obj.dict())
    return user_obj

@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return User(**user)

@api_router.put("/users/{user_id}/credits")
async def update_credits(user_id: str, credits_used: int):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_credits = max(0, user["credits"] - credits_used)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"credits": new_credits}}
    )
    return {"credits_remaining": new_credits}

@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_id = str(uuid.uuid4())
        file_extension = Path(file.filename).suffix
        file_path = UPLOAD_DIR / f"{file_id}{file_extension}"
        
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Store file metadata in database
        file_metadata = {
            "id": file_id,
            "original_name": file.filename,
            "file_path": str(file_path),
            "mime_type": file.content_type,
            "size": len(content),
            "uploaded_at": datetime.now(timezone.utc)
        }
        await db.files.insert_one(file_metadata)
        
        return {"file_id": file_id, "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@api_router.post("/research", response_model=dict)
async def create_research_question(
    user_id: str = Form(...),
    question: str = Form(...),
    file_ids: str = Form(default="[]")
):
    try:
        # Parse file IDs
        file_ids_list = json.loads(file_ids) if file_ids else []
        
        # Check user credits
        user = await db.users.find_one({"id": user_id})
        if not user or user["credits"] < 1:
            raise HTTPException(status_code=400, detail="Insufficient credits")
        
        # Create research question
        research_q = ResearchQuestion(
            user_id=user_id,
            question=question,
            files=file_ids_list
        )
        await db.research_questions.insert_one(research_q.dict())
        
        # Process the question asynchronously
        asyncio.create_task(process_research_question(research_q.id, user_id, question, file_ids_list))
        
        return {"question_id": research_q.id, "status": "processing"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Research request failed: {str(e)}")

async def process_research_question(question_id: str, user_id: str, question: str, file_ids: List[str]):
    try:
        # Update status to processing
        await db.research_questions.update_one(
            {"id": question_id},
            {"$set": {"status": "processing"}}
        )
        
        # Get Gemini chat instance
        chat = await get_gemini_chat()
        
        # Collect file contents
        file_contents = []
        sources_used = []
        
        for file_id in file_ids:
            file_meta = await db.files.find_one({"id": file_id})
            if file_meta:
                file_content = FileContentWithMimeType(
                    file_path=file_meta["file_path"],
                    mime_type=file_meta["mime_type"]
                )
                file_contents.append(file_content)
                sources_used.append(file_meta["original_name"])
        
        # Add mock live data
        live_news = random.sample(MOCK_NEWS, min(2, len(MOCK_NEWS)))
        live_data_text = "\n\n--- LIVE DATA SOURCES ---\n"
        for news in live_news:
            live_data_text += f"Title: {news['title']}\nContent: {news['content']}\nSource: {news['source']}\n\n"
            sources_used.append(news['source'])
        
        # Create comprehensive prompt
        full_question = f"""
Research Question: {question}

Please analyze the uploaded files and the following live data to generate a comprehensive research report.

{live_data_text}

Generate a structured report with:
1. Key Findings (2-3 main insights)
2. Supporting Evidence (with specific citations)
3. Actionable Recommendations
4. Sources Referenced

Focus on providing evidence-based answers with proper citations.
"""
        
        # Send to Gemini
        user_message = UserMessage(
            text=full_question,
            file_contents=file_contents if file_contents else None
        )
        
        response = await chat.send_message(user_message)
        
        # Create citations list
        citations = [f"Source: {source}" for source in sources_used]
        
        # Create research report
        report = ResearchReport(
            question_id=question_id,
            user_id=user_id,
            report=response,
            citations=citations,
            sources_used=sources_used,
            live_data_included=True
        )
        
        await db.research_reports.insert_one(report.dict())
        
        # Update question status
        await db.research_questions.update_one(
            {"id": question_id},
            {"$set": {"status": "completed"}}
        )
        
        # Deduct credits
        await db.users.update_one(
            {"id": user_id},
            {"$inc": {"credits": -1}}
        )
        
    except Exception as e:
        logging.error(f"Research processing failed: {str(e)}")
        await db.research_questions.update_one(
            {"id": question_id},
            {"$set": {"status": "failed"}}
        )

@api_router.get("/research/{question_id}")
async def get_research_status(question_id: str):
    question = await db.research_questions.find_one({"id": question_id})
    if not question:
        raise HTTPException(status_code=404, detail="Research question not found")
    
    # Remove MongoDB ObjectId before serialization
    if "_id" in question:
        del question["_id"]
    
    result = {"status": question["status"]}
    
    if question["status"] == "completed":
        report = await db.research_reports.find_one({"question_id": question_id})
        if report:
            # Remove MongoDB ObjectId before serialization
            if "_id" in report:
                del report["_id"]
            result["report"] = ResearchReport(**report)
    
    return result

@api_router.get("/reports/{user_id}")
async def get_user_reports(user_id: str):
    reports = await db.research_reports.find({"user_id": user_id}).to_list(100)
    questions = await db.research_questions.find({"user_id": user_id}).to_list(100)
    
    # Remove MongoDB ObjectIds before serialization
    for report in reports:
        if "_id" in report:
            del report["_id"]
    
    for question in questions:
        if "_id" in question:
            del question["_id"]
    
    # Combine reports with questions
    combined_reports = []
    for report in reports:
        question = next((q for q in questions if q["id"] == report["question_id"]), None)
        if question:
            combined_reports.append({
                "report": ResearchReport(**report),
                "question": ResearchQuestion(**question)
            })
    
    return combined_reports

@api_router.get("/news")
async def get_latest_news():
    # Return mock news with recent timestamps
    news_items = []
    for news in MOCK_NEWS:
        news_item = NewsItem(
            title=news["title"],
            content=news["content"],
            source=news["source"]
        )
        news_items.append(news_item)
    
    return news_items

@api_router.get("/stats/{user_id}")
async def get_user_stats(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    total_questions = await db.research_questions.count_documents({"user_id": user_id})
    completed_reports = await db.research_reports.count_documents({"user_id": user_id})
    
    return {
        "credits_remaining": user["credits"],
        "total_questions_asked": total_questions,
        "reports_generated": completed_reports,
        "credits_used": 100 - user["credits"]
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()