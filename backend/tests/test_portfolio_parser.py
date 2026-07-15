from pathlib import Path

import pytest

from app.services.portfolio_parser import parse_portfolio_markdown
from app.services.portfolio_service import load_portfolio


FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_portfolio_markdown_reads_core_sections() -> None:
    content = (FIXTURES / "sample_portfolio.md").read_text(encoding="utf-8")
    portfolio = parse_portfolio_markdown(content)

    assert portfolio.name == "Ganesh R"
    assert portfolio.title == "Data Scientist & AI Engineer"
    assert "Generative AI" in portfolio.skills
    assert len(portfolio.experience) >= 2
    assert len(portfolio.education) == 2
    assert portfolio.education[0].degree == "Master of Science (MS), Computer Science"
    assert portfolio.education[0].years == "2013 - 2015"
    assert portfolio.education[1].institution == "Vishwakarma Institute Of Technology"
    assert len(portfolio.projects) >= 1
    assert any(link.label == "LinkedIn" for link in portfolio.contact_links)


def test_load_portfolio_from_repo_content() -> None:
    portfolio = load_portfolio()
    assert portfolio.name == "Ganesh R"
    assert len(portfolio.summary) == 3
    assert portfolio.skills
