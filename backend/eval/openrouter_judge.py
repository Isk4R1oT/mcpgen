"""Custom DeepEval LLM using OpenRouter as the judge model."""

from pydantic import BaseModel
from deepeval.models import DeepEvalBaseLLM
from openai import OpenAI


class OpenRouterJudge(DeepEvalBaseLLM):
    """DeepEval LLM implementation using OpenRouter API."""

    def __init__(self, api_key: str, model_name: str):
        self._api_key = api_key
        self._model_name = model_name
        self._client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )

    def load_model(self) -> OpenAI:
        return self._client

    def generate(self, prompt: str, schema: BaseModel | None = None) -> str | BaseModel:
        client = self.load_model()

        if schema is not None:
            response = client.chat.completions.create(
                model=self._model_name,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0,
            )
            text = response.choices[0].message.content or ""
            import json
            data = json.loads(text)
            return schema(**data)

        response = client.chat.completions.create(
            model=self._model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        return response.choices[0].message.content or ""

    async def a_generate(self, prompt: str, schema: BaseModel | None = None) -> str | BaseModel:
        return self.generate(prompt, schema)

    def get_model_name(self) -> str:
        return self._model_name
