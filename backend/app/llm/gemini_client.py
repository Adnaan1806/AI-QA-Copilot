import json
import os
from typing import Optional

from google import genai
from google.genai import types

from app.llm.client import LLMClient

GEMINI_MODEL = "gemini-3.6-flash"


class GeminiClient(LLMClient):
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.environ["GEMINI_API_KEY"]
        self._client = genai.Client(api_key=api_key)

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict:
        response = self._client.models.generate_content(
            model=GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
            ),
        )
        return json.loads(response.text)
