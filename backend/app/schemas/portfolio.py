from pydantic import BaseModel


class ContactLink(BaseModel):
    label: str
    url: str


class Project(BaseModel):
    title: str
    description: str
    tags: list[str]


class ExperienceItem(BaseModel):
    company: str
    role: str
    duration: str
    location: str
    highlights: list[str]


class EducationItem(BaseModel):
    institution: str
    degree: str
    years: str


class Portfolio(BaseModel):
    name: str
    title: str
    location: str
    summary: list[str]
    skills: list[str]
    experience: list[ExperienceItem]
    education: list[EducationItem]
    projects: list[Project]
    honors: list[str]
    contact_links: list[ContactLink]
    contact_note: str
