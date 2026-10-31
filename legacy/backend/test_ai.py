import asyncio
from app.api.endpoints.ai_report import generate_ai_report
import json

class DummyUser:
    def __init__(self):
        self.id = "4995c64c-3e6f-4cb1-97b7-5ab16ab9e504"

async def test():
    try:
        # Since Depends gets resolved by FastAPI, we pass it manually
        report = await generate_ai_report(DummyUser())
        print("SUCCESS")
        print(report)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
