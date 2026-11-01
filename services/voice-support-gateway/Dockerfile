# Build context is the repository root (az acr build ... --file services/voice-support-gateway/Dockerfile .),
# so the public support guide can be copied from user-chef-service: one source of truth for what the agent knows.
FROM python:3.12-slim
WORKDIR /app
RUN useradd --create-home --uid 10001 gateway
COPY services/voice-support-gateway/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY services/voice-support-gateway/voice_gateway ./voice_gateway
COPY services/user-chef-service/src/main/resources/support-assistant/guide.md ./voice_gateway/guide.md
USER gateway
EXPOSE 8080
CMD ["python", "-m", "voice_gateway"]
