"""Tests for loading the chatbot knowledge file."""

from pathlib import Path

import pytest

from app.services import chat_content_service


def _point_at(monkeypatch: pytest.MonkeyPatch, path: Path) -> None:
    monkeypatch.setattr(chat_content_service.settings, "chat_content_path", str(path))


def test_loads_and_strips_content(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    content_file = tmp_path / "chat.md"
    content_file.write_text("\n  # About me  \n", encoding="utf-8")
    _point_at(monkeypatch, content_file)

    assert chat_content_service.load_chat_content() == "# About me"
    assert chat_content_service.chat_content_exists() is True


def test_missing_file_falls_back_to_empty(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _point_at(monkeypatch, tmp_path / "missing.md")

    assert chat_content_service.load_chat_content() == ""
    assert chat_content_service.chat_content_exists() is False


def test_unreadable_file_falls_back_to_empty(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    content_file = tmp_path / "binary.md"
    content_file.write_bytes(b"\xff\xfe\xfa invalid utf-8")
    _point_at(monkeypatch, content_file)

    assert chat_content_service.load_chat_content() == ""
