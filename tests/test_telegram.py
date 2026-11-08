import pytest
from httpx import AsyncClient, Response
from unittest.mock import patch, MagicMock
from pathlib import Path
from types import SimpleNamespace

from app.core.config import settings
from app.services.telegram import (
    format_caption,
    get_telegram_status,
    send_test_message,
    publish_to_telegram,
    TelegramError,
)


def test_format_caption_basic():
    caption = format_caption(custom_caption="Golden hour at the coast")
    assert caption == "Golden hour at the coast"


def test_format_caption_full_metadata():
    caption = format_caption(
        custom_caption="Epic landscape shot",
        location_name="Big Sur, California, USA",
        camera="Sony A7IV",
        lens="FE 24-70mm F2.8 GM II",
        focal_length="35mm",
        aperture="2.8",
        exposure_time="1/250",
        iso=100,
    )
    assert "Epic landscape shot" in caption
    assert "📍 Big Sur, California, USA" in caption
    assert "📷 Sony A7IV • FE 24-70mm F2.8 GM II" in caption
    assert "⚙️ 35mm | f/2.8 | 1/250s | ISO 100" in caption


def test_format_caption_truncation():
    long_text = "A" * 1500
    caption = format_caption(custom_caption=long_text, max_length=100)
    assert len(caption) <= 100
    assert caption.endswith("...")


def test_get_telegram_status_simulation():
    with patch.object(settings, "telegram_bot_token", None), \
         patch.object(settings, "telegram_chat_id", None), \
         patch.object(settings, "simulate_social_publish", True):
        status = get_telegram_status()
        assert status["connected"] is False
        assert status["mode"] == "simulation"


def test_get_telegram_status_live():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "ok": True,
        "result": {"id": 123456, "is_bot": True, "first_name": "SabbalensBot", "username": "sabbalens_bot"}
    }

    with patch.object(settings, "telegram_bot_token", "fake_token"), \
         patch.object(settings, "telegram_chat_id", "@photo_channel"), \
         patch("httpx.Client.get", return_value=mock_resp):
        status = get_telegram_status()
        assert status["connected"] is True
        assert status["mode"] == "live"
        assert status["bot_username"] == "sabbalens_bot"
        assert status["chat_id"] == "@photo_channel"


def test_send_test_message_simulation():
    with patch.object(settings, "telegram_bot_token", None), \
         patch.object(settings, "telegram_chat_id", None), \
         patch.object(settings, "simulate_social_publish", True):
        res = send_test_message()
        assert res["ok"] is True
        assert res["simulated"] is True


def test_send_test_message_live():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True, "result": {"message_id": 42}}

    with patch.object(settings, "telegram_bot_token", "fake_token"), \
         patch.object(settings, "telegram_chat_id", "@photo_channel"), \
         patch("httpx.Client.post", return_value=mock_resp):
        res = send_test_message("Test message")
        assert res["ok"] is True
        assert res["result"]["message_id"] == 42


def test_publish_to_telegram_unsupported_format(tmp_path):
    bad_file = tmp_path / "test.txt"
    bad_file.write_text("not an image")
    with pytest.raises(TelegramError, match="Unsupported format"):
        publish_to_telegram(file_path=str(bad_file))


def test_publish_to_telegram_file_not_found():
    with pytest.raises(TelegramError, match="File not found"):
        publish_to_telegram(file_path="/non/existent/path.jpg")


def test_publish_to_telegram_simulation(tmp_path):
    img_file = tmp_path / "test.jpg"
    img_file.write_bytes(b"\xff\xd8\xff\xe0")

    with patch.object(settings, "telegram_bot_token", None), \
         patch.object(settings, "telegram_chat_id", None), \
         patch.object(settings, "simulate_social_publish", True):
        mid = publish_to_telegram(file_path=str(img_file), caption="Sim post")
        assert mid.startswith("sim_tele_")


def test_publish_to_telegram_live(tmp_path):
    img_file = tmp_path / "test.jpg"
    img_file.write_bytes(b"\xff\xd8\xff\xe0")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"ok": True, "result": {"message_id": 9999}}

    photo_dummy = SimpleNamespace(
        caption="Live test caption",
        location_name="Yosemite National Park",
        camera="Canon EOS R5",
        lens="RF 24-70mm F2.8L",
        focal_length="24mm",
        aperture="4.0",
        exposure_time="1/500",
        iso=200,
    )

    with patch.object(settings, "telegram_bot_token", "fake_token"), \
         patch.object(settings, "telegram_chat_id", "@my_channel"), \
         patch("httpx.Client.post", return_value=mock_resp) as mock_post:
        mid = publish_to_telegram(file_path=str(img_file), photo_obj=photo_dummy)
        assert mid == "9999"
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["data"]["chat_id"] == "@my_channel"
        assert "Yosemite National Park" in call_kwargs["data"]["caption"]


@pytest.mark.asyncio
async def test_api_telegram_status(client: AsyncClient):
    resp = await client.get("/api/v1/telegram/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "connected" in data
    assert "mode" in data


@pytest.mark.asyncio
async def test_api_telegram_test_message(client: AsyncClient):
    resp = await client.post("/api/v1/telegram/test", json={"text": "Integration test"})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("ok") is True

