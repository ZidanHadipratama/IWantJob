"""
ATS-Optimized Resume PDF generator (LaTeX-faithful port).

Matches the "Ethan's Resume Template" LaTeX style:
  - Small-caps name, centered header
  - SCSHAPE + titlerule section headers
  - cvheading: bold company left / date right, italic role left / location right
  - Open-bullet items, justified text
  - Tight vertical spacing throughout
"""

import io
import re

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, KeepTogether,
)
from reportlab.platypus.flowables import Flowable

from app.models.schemas import ResumeJSON

# ── Layout ───────────────────────────────────────────────────────────────
MARGIN_LEFT   = 0.50 * inch
MARGIN_RIGHT  = 0.50 * inch
MARGIN_TOP    = 0.50 * inch
MARGIN_BOTTOM = 0.50 * inch

# ── Typography ───────────────────────────────────────────────────────────
FONT_NORMAL = "Helvetica"
FONT_BOLD   = "Helvetica-Bold"
FONT_ITALIC = "Helvetica-Oblique"

FS_NAME    = 14.5
FS_CONTACT = 9.0
FS_SECTION = 11.0
FS_BODY    = 10.0
FS_SMALL   = 9.5

BLACK      = colors.black
BULLET     = "\u2022"  # • filled circle bullet


# ── Helpers ──────────────────────────────────────────────────────────────

def _esc(text: str) -> str:
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def _shorten_url(url: str) -> str:
    url = re.sub(r'^https?://(www\.)?', '', url)
    return url.rstrip('/')


def _small_caps_markup(text: str, size: float, bold: bool = False) -> str:
    """Approximate small caps via size reduction on lowercase letters."""
    font = FONT_BOLD if bold else FONT_NORMAL
    result = []
    for ch in text:
        if ch.isupper():
            result.append(f'<font name="{font}" size="{size}">{ch}</font>')
        elif ch.islower():
            result.append(f'<font name="{font}" size="{size * 0.82:.1f}">{ch.upper()}</font>')
        else:
            result.append(f'<font name="{font}" size="{size}">{ch}</font>')
    return "".join(result)


# ── Two-column flowable ─────────────────────────────────────────────────

class TwoCol(Flowable):
    """Render two Paragraphs side-by-side (left / right) on one line."""

    def __init__(self, left_para, right_para, total_width, left_frac=0.70):
        super().__init__()
        self.lp = left_para
        self.rp = right_para
        self.total_width = total_width
        self.lw = total_width * left_frac
        self.rw = total_width * (1 - left_frac)
        lh = self.lp.wrap(self.lw, 500)[1]
        rh = self.rp.wrap(self.rw, 500)[1]
        self.height = max(lh, rh)

    def wrap(self, aw, ah):
        return self.total_width, self.height

    def draw(self):
        self.rp.wrap(self.rw, 500)
        self.rp.drawOn(self.canv, self.lw, 0)
        self.lp.wrap(self.lw, 500)
        self.lp.drawOn(self.canv, 0, 0)


def _two_col(left_text, right_text, ls, rs, W, left_frac=0.70):
    return TwoCol(Paragraph(left_text, ls), Paragraph(right_text, rs), W, left_frac)


# ── Styles ───────────────────────────────────────────────────────────────

def _build_styles():
    s = {}

    s["name"] = ParagraphStyle(
        "name", fontName=FONT_BOLD, fontSize=FS_NAME,
        leading=FS_NAME * 1.2, alignment=TA_CENTER,
        spaceAfter=1, textColor=BLACK,
    )
    s["contact"] = ParagraphStyle(
        "contact", fontName=FONT_NORMAL, fontSize=FS_CONTACT,
        leading=FS_CONTACT * 1.4, alignment=TA_CENTER,
        spaceAfter=2, textColor=BLACK,
    )
    s["section"] = ParagraphStyle(
        "section", fontName=FONT_NORMAL, fontSize=FS_SECTION,
        leading=FS_SECTION * 1.3, spaceBefore=5, spaceAfter=0,
        textColor=BLACK,
    )
    s["head_company"] = ParagraphStyle(
        "head_company", fontName=FONT_BOLD, fontSize=FS_BODY,
        leading=FS_BODY * 1.3, textColor=BLACK,
    )
    s["head_date"] = ParagraphStyle(
        "head_date", fontName=FONT_NORMAL, fontSize=FS_BODY,
        leading=FS_BODY * 1.3, alignment=TA_RIGHT, textColor=BLACK,
    )
    s["head_role"] = ParagraphStyle(
        "head_role", fontName=FONT_ITALIC, fontSize=FS_SMALL,
        leading=FS_SMALL * 1.3, textColor=BLACK,
    )
    s["head_loc"] = ParagraphStyle(
        "head_loc", fontName=FONT_NORMAL, fontSize=FS_SMALL,
        leading=FS_SMALL * 1.3, alignment=TA_RIGHT, textColor=BLACK,
    )
    s["proj_name"] = ParagraphStyle(
        "proj_name", fontName=FONT_BOLD, fontSize=FS_BODY,
        leading=FS_BODY * 1.3, textColor=BLACK,
    )
    s["proj_desc"] = ParagraphStyle(
        "proj_desc", fontName=FONT_ITALIC, fontSize=FS_SMALL,
        leading=FS_SMALL * 1.3, textColor=BLACK,
    )
    s["proj_url"] = ParagraphStyle(
        "proj_url", fontName=FONT_NORMAL, fontSize=FS_SMALL,
        leading=FS_SMALL * 1.25, textColor=BLACK,
    )
    s["bullet"] = ParagraphStyle(
        "bullet", fontName=FONT_NORMAL, fontSize=FS_SMALL,
        leading=FS_SMALL * 1.35, leftIndent=14, firstLineIndent=-8,
        spaceAfter=0.5, textColor=BLACK, alignment=TA_JUSTIFY,
    )
    s["skill"] = ParagraphStyle(
        "skill", fontName=FONT_NORMAL, fontSize=FS_SMALL,
        leading=FS_SMALL * 1.35, leftIndent=14, firstLineIndent=-14,
        spaceAfter=0.5, textColor=BLACK, alignment=TA_JUSTIFY,
    )
    s["summary"] = ParagraphStyle(
        "summary", fontName=FONT_NORMAL, fontSize=FS_SMALL,
        leading=FS_SMALL * 1.35, spaceAfter=2, textColor=BLACK,
        alignment=TA_JUSTIFY,
    )

    return s


# ── Section header (small-caps + rule) ───────────────────────────────────

def _section_header(title, styles, W):
    markup = _small_caps_markup(title, FS_SECTION, bold=False)
    return [
        Paragraph(markup, styles["section"]),
        HRFlowable(
            width=W, thickness=0.7, color=BLACK,
            spaceBefore=1, spaceAfter=3,
        ),
    ]


# ── Bullet items ─────────────────────────────────────────────────────────

def _make_bullets(items, styles):
    out = []
    for item in items:
        text = f'{BULLET}  {_esc(item)}'
        out.append(Paragraph(text, styles["bullet"]))
    return out


# ── Entry block (two-col heading + bullets) ──────────────────────────────

def _entry_block(heading, dates, subheading, location, bullets, styles, W):
    """Build a KeepTogether group for one resume entry.

    Layout:
      Line 1: **heading** (left, bold)  |  dates (right)
      Line 2: *subheading* (left, italic)  |  location (right)
      Bullets below
    """
    group = []

    # Line 1: heading + dates
    if heading or dates:
        group.append(_two_col(
            _esc(heading or ""), _esc(dates or ""),
            styles["head_company"], styles["head_date"], W,
        ))

    # Line 2: subheading + location
    if subheading or location:
        group.append(_two_col(
            _esc(subheading or ""), _esc(location or ""),
            styles["head_role"], styles["head_loc"], W,
        ))

    group += _make_bullets(bullets, styles)
    group.append(Spacer(1, 3))
    return KeepTogether(group)


# ── Project block ────────────────────────────────────────────────────────

def _project_block(name, url, description, bullets, styles, W):
    group = []

    name_esc = _esc(name)
    if url:
        name_markup = f'<link href="{url}" color="#000000"><b>{name_esc}</b></link>'
    else:
        name_markup = f'<b>{name_esc}</b>'
    group.append(Paragraph(name_markup, styles["proj_name"]))

    if url:
        url_esc = _esc(url)
        group.append(
            Paragraph(
                f'<link href="{url_esc}" color="#000000">{url_esc}</link>',
                styles["proj_url"],
            )
        )

    if description:
        group.append(Paragraph(_esc(description), styles["proj_desc"]))

    group += _make_bullets(bullets, styles)
    group.append(Spacer(1, 3))
    return KeepTogether(group)


# ── Section builders ─────────────────────────────────────────────────────

def _build_header(resume, styles, W):
    story = []
    c = resume.contact

    # Name in small caps
    if c.name:
        name_markup = _small_caps_markup(_esc(c.name), FS_NAME, bold=True)
        story.append(Paragraph(name_markup, styles["name"]))

    # Contact line with diamond separators
    SEP = ' &nbsp;|&nbsp; '
    parts = []
    if c.email:
        parts.append(
            f'<link href="mailto:{_esc(c.email)}" color="#000000">{_esc(c.email)}</link>'
        )
    if c.phone:
        parts.append(_esc(c.phone))
    if c.location:
        parts.append(_esc(c.location))
    if c.linkedin:
        display = _shorten_url(c.linkedin) if c.linkedin.startswith("http") else c.linkedin
        parts.append(
            f'<link href="{_esc(c.linkedin)}" color="#000000">{_esc(display)}</link>'
        )
    if c.github:
        display = _shorten_url(c.github) if c.github.startswith("http") else c.github
        parts.append(
            f'<link href="{_esc(c.github)}" color="#000000">{_esc(display)}</link>'
        )
    if c.website:
        display = _shorten_url(c.website)
        parts.append(
            f'<link href="{_esc(c.website)}" color="#000000">{_esc(display)}</link>'
        )

    if parts:
        story.append(Paragraph(SEP.join(parts), styles["contact"]))

    return story


def _is_project_section(title: str) -> bool:
    return title.lower() in ("projects", "project", "personal projects", "side projects")


def _build_section(section, styles, W):
    story = _section_header(section.title, styles, W)

    is_projects = _is_project_section(section.title)

    for entry in section.entries:
        if is_projects:
            story.append(_project_block(
                name=entry.heading,
                url=entry.url,
                description=entry.subheading,
                bullets=entry.bullets,
                styles=styles, W=W,
            ))
        else:
            story.append(_entry_block(
                heading=entry.heading,
                dates=entry.dates,
                subheading=entry.subheading,
                location=entry.location,
                bullets=entry.bullets,
                styles=styles, W=W,
            ))

    return story


def _build_summary(summary, styles, W):
    story = _section_header("Summary", styles, W)
    story.append(Paragraph(_esc(summary), styles["summary"]))
    return story


def _build_skills(skills, styles, W):
    skill_lines = []
    for cat, vals in [
        ("Languages", skills.languages),
        ("Frameworks", skills.frameworks),
        ("Tools", skills.tools),
        ("Other", skills.other),
    ]:
        if vals:
            skill_lines.append((cat, ", ".join(vals)))

    if not skill_lines:
        return []

    story = _section_header("Skills", styles, W)
    for cat, items in skill_lines:
        markup = f'{BULLET}&nbsp; <b>{_esc(cat)}:</b> {_esc(items)}'
        story.append(Paragraph(markup, styles["skill"]))
    story.append(Spacer(1, 3))
    return story


# ── Main entry point ─────────────────────────────────────────────────────

def generate_resume_pdf(resume: ResumeJSON) -> tuple[bytes, int]:
    """Generate a LaTeX-style ATS PDF from ResumeJSON. Returns (pdf_bytes, page_count)."""
    buf = io.BytesIO()
    page_counter = [0]

    def on_page(canvas, doc):
        page_counter[0] += 1

    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=MARGIN_TOP, bottomMargin=MARGIN_BOTTOM,
        leftMargin=MARGIN_LEFT, rightMargin=MARGIN_RIGHT,
        title=f"{resume.contact.name or 'Resume'} — Resume",
        author=resume.contact.name or "",
        subject="Resume / Curriculum Vitae",
        creator="IWantJob",
    )

    W = letter[0] - MARGIN_LEFT - MARGIN_RIGHT
    styles = _build_styles()
    story = []

    # Header
    story += _build_header(resume, styles, W)

    # Summary
    if resume.summary:
        story += _build_summary(resume.summary, styles, W)

    # Skills
    if resume.skills:
        story += _build_skills(resume.skills, styles, W)

    # All sections
    for section in resume.sections:
        story += _build_section(section, styles, W)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue(), page_counter[0]
