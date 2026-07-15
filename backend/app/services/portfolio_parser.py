from __future__ import annotations

import re

from app.schemas.portfolio import (
    ContactLink,
    EducationItem,
    ExperienceItem,
    Portfolio,
    Project,
)


def _split_sections(content: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    current_key = "_header"
    current_lines: list[str] = []

    for line in content.splitlines():
        if line.startswith("# ") and not line.startswith("## "):
            if current_lines:
                sections[current_key] = "\n".join(current_lines).strip()
            current_key = line[2:].strip().rstrip(":")
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        sections[current_key] = "\n".join(current_lines).strip()

    return sections


def _parse_header(header: str) -> tuple[str, str, str]:
    name = "Portfolio Owner"
    title = ""
    location = ""

    for line in header.splitlines():
        stripped = line.strip()
        if stripped.startswith("## Name:"):
            name = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("Title:"):
            title = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("Location:"):
            location = stripped.split(":", 1)[1].strip()
        elif stripped and not title and not stripped.startswith("#"):
            if not location and "," in stripped:
                location = stripped
            elif not title:
                title = stripped

    return name, title, location


def _parse_skills(section: str) -> list[str]:
    skills: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        skills.append(stripped)
    return skills


def _parse_bullet_lines(block: str) -> list[str]:
    highlights: list[str] = []
    for line in block.splitlines():
        stripped = line.strip()
        if stripped.startswith("•"):
            highlights.append(stripped.lstrip("•").strip())
        elif stripped.startswith("-"):
            highlights.append(stripped.lstrip("-").strip())
    return highlights


def _parse_experience(section: str) -> list[ExperienceItem]:
    items: list[ExperienceItem] = []
    chunks = re.split(r"\n(?=## )", section)

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk.startswith("## "):
            continue

        lines = chunk.splitlines()
        company = lines[0].replace("## ", "").strip()
        body_lines = [line.strip() for line in lines[1:] if line.strip()]

        role = body_lines[0] if body_lines else company
        duration = body_lines[1] if len(body_lines) > 1 else ""
        location = body_lines[2] if len(body_lines) > 2 else ""
        highlight_block = "\n".join(body_lines[3:]) if len(body_lines) > 3 else ""

        items.append(
            ExperienceItem(
                company=company,
                role=role,
                duration=duration,
                location=location,
                highlights=_parse_bullet_lines(highlight_block),
            )
        )

    return items


def _parse_education(section: str) -> list[EducationItem]:
    items: list[EducationItem] = []
    blocks = re.split(r"\n(?=\d+\.\s)", section)

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue

        institution = re.sub(r"^\d+\.\s*", "", lines[0]).strip()
        degree = ""
        years = ""

        if len(lines) > 1:
            detail = lines[1]
            years_match = re.search(r"·?\s*\((\d{4}\s*-\s*\d{4})\)\s*$", detail)
            if years_match:
                years = years_match.group(1).strip()
                detail = detail[: years_match.start()].strip()
            else:
                years_match = re.search(r"\((\d{4}\s*-\s*\d{4})\)", detail)
                if years_match:
                    years = years_match.group(1).strip()
                    detail = (detail[: years_match.start()] + detail[years_match.end() :]).strip()

            detail = re.sub(r"\s*[·•]\s*$", "", detail).strip()
            degree = detail

        if not years and len(lines) > 2:
            years = lines[2].strip()

        if institution:
            items.append(
                EducationItem(
                    institution=institution,
                    degree=degree,
                    years=years,
                )
            )

    return items


def _parse_projects(section: str) -> list[Project]:
    items: list[Project] = []
    chunks = re.split(r"\n(?=## )", section)

    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk.startswith("## "):
            continue

        lines = chunk.splitlines()
        title = lines[0].replace("## ", "").strip()
        description = ""
        tags: list[str] = []

        for line in lines[1:]:
            stripped = line.strip()
            if stripped.lower().startswith("description:"):
                description = stripped.split(":", 1)[1].strip()
            elif stripped.lower().startswith("tags:"):
                tags = [tag.strip() for tag in stripped.split(":", 1)[1].split(",") if tag.strip()]

        if title:
            items.append(Project(title=title, description=description, tags=tags))

    return items


def _parse_honors(section: str) -> list[str]:
    return [line.strip() for line in section.splitlines() if line.strip()]


def _normalize_url(raw_url: str) -> str:
    url = raw_url.strip()
    if url.startswith("www."):
        return f"https://{url}"
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if "linkedin.com" in url:
        return f"https://{url.removeprefix('https://').removeprefix('http://')}"
    return url


def _parse_contact(section: str) -> tuple[list[ContactLink], str]:
    links: list[ContactLink] = []
    note_lines: list[str] = []

    for line in section.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if ":" in stripped and not stripped.lower().startswith("note:"):
            label, value = stripped.split(":", 1)
            label = label.strip()
            value = value.strip()
            if label.lower() == "note":
                note_lines.append(value)
            else:
                links.append(ContactLink(label=label, url=_normalize_url(value)))
        elif stripped.lower().startswith("note:"):
            note_lines.append(stripped.split(":", 1)[1].strip())
        else:
            note_lines.append(stripped)

    return links, " ".join(note_lines)


def _parse_summary(section: str) -> list[str]:
    bullets = _parse_bullet_lines(section)
    if bullets:
        return bullets

    paragraphs = [line.strip() for line in section.splitlines() if line.strip()]
    return paragraphs


def parse_portfolio_markdown(content: str) -> Portfolio:
    sections = _split_sections(content)
    header = sections.get("_header", "")
    name, title, location = _parse_header(header)
    contact_links, contact_note = _parse_contact(sections.get("Contact", ""))

    return Portfolio(
        name=name,
        title=title,
        location=location,
        summary=_parse_summary(sections.get("Summary", "")),
        skills=_parse_skills(sections.get("Technical Skills", "")),
        experience=_parse_experience(sections.get("Experience", "")),
        education=_parse_education(sections.get("Education", "")),
        projects=_parse_projects(sections.get("Projects", "")),
        honors=_parse_honors(sections.get("Honors-Awards", "")),
        contact_links=contact_links,
        contact_note=contact_note,
    )
