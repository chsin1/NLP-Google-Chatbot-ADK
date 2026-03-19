from dotenv import load_dotenv
load_dotenv(".env.local")

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part
from agent import root_agent
import json, os
from datetime import datetime

app = FastAPI()

APP_NAME = "agents"
USER_ID = "user_1"

session_service = InMemorySessionService()
runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service
)

created_sessions = set()

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default-session"
    context: dict = {}

@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        # Create session if not already created
        if req.session_id not in created_sessions:
            try:
                session = await session_service.create_session(
                    app_name=APP_NAME,
                    user_id=USER_ID,
                    session_id=req.session_id
                )
                created_sessions.add(req.session_id)
                print(f"Session created: {session}")
            except Exception as se:
                print(f"Session create note: {se}")

        user_message = Content(
            role="user",
            parts=[Part(text=req.message)]
        )

        final_text = ""
        async for event in runner.run_async(
            user_id=USER_ID,
            session_id=req.session_id,
            new_message=user_message
        ):
            if event.is_final_response() and event.content:
                for part in event.content.parts:
                    if hasattr(part, "text"):
                        final_text += part.text

        reply = final_text.strip() or "I'm here to help with your Bell services."

        # Log conversation turn
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "session_id": req.session_id,
            "user": req.message,
            "agent": reply
        }
        os.makedirs("logs", exist_ok=True)
        with open("logs/adk-conversations.log", "a") as f:
            f.write(json.dumps(log_entry) + "\n")

        return {
            "text": reply,
            "session_id": req.session_id,
            "mode": "adk_local"
        }

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

@app.get("/health")
async def health():
    return {"status": "ok", "mode": "adk_local"}