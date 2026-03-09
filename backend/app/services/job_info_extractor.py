"""Regex/heuristic job info extraction — no AI model needed.
Uses hardcoded DB of 193 UN nations + global currencies.
"""
import re
from typing import Dict, Optional


# ============================================================
# DATABASE: Nations (193 UN members + common city aliases)
# ============================================================
NATIONS = {
    "Afghanistan": ["afghanistan"],
    "Albania": ["albania"],
    "Algeria": ["algeria"],
    "Andorra": ["andorra"],
    "Angola": ["angola"],
    "Antigua and Barbuda": ["antigua and barbuda", "antigua"],
    "Argentina": ["argentina", "buenos aires"],
    "Armenia": ["armenia"],
    "Australia": ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide"],
    "Austria": ["austria", "vienna", "wien"],
    "Azerbaijan": ["azerbaijan", "baku"],
    "Bahamas": ["bahamas", "nassau"],
    "Bahrain": ["bahrain", "manama"],
    "Bangladesh": ["bangladesh", "dhaka"],
    "Barbados": ["barbados"],
    "Belarus": ["belarus", "minsk"],
    "Belgium": ["belgium", "brussels", "bruxelles"],
    "Belize": ["belize"],
    "Benin": ["benin"],
    "Bhutan": ["bhutan"],
    "Bolivia": ["bolivia"],
    "Bosnia and Herzegovina": ["bosnia and herzegovina", "bosnia", "sarajevo"],
    "Botswana": ["botswana", "gaborone"],
    "Brazil": ["brazil", "brasil", "são paulo", "sao paulo", "rio de janeiro"],
    "Brunei": ["brunei"],
    "Bulgaria": ["bulgaria", "sofia"],
    "Burkina Faso": ["burkina faso"],
    "Burundi": ["burundi"],
    "Cabo Verde": ["cabo verde", "cape verde"],
    "Cambodia": ["cambodia", "phnom penh"],
    "Cameroon": ["cameroon"],
    "Canada": ["canada", "toronto", "vancouver", "montreal", "ottawa", "calgary"],
    "Central African Republic": ["central african republic"],
    "Chad": ["chad"],
    "Chile": ["chile", "santiago"],
    "China": ["china", "beijing", "shanghai", "shenzhen", "guangzhou"],
    "Colombia": ["colombia", "bogota", "bogotá", "medellin", "medellín"],
    "Comoros": ["comoros"],
    "Congo": ["congo", "kinshasa", "brazzaville"],
    "Costa Rica": ["costa rica", "san jose", "san josé"],
    "Côte d'Ivoire": ["côte d'ivoire", "cote d'ivoire", "ivory coast", "abidjan"],
    "Croatia": ["croatia", "zagreb"],
    "Cuba": ["cuba", "havana"],
    "Cyprus": ["cyprus", "nicosia"],
    "Czech Republic": ["czech republic", "czechia", "prague"],
    "Denmark": ["denmark", "copenhagen"],
    "Djibouti": ["djibouti"],
    "Dominica": ["dominica"],
    "Dominican Republic": ["dominican republic", "santo domingo"],
    "Ecuador": ["ecuador", "quito"],
    "Egypt": ["egypt", "cairo"],
    "El Salvador": ["el salvador", "san salvador"],
    "Equatorial Guinea": ["equatorial guinea"],
    "Eritrea": ["eritrea"],
    "Estonia": ["estonia", "tallinn"],
    "Eswatini": ["eswatini", "swaziland"],
    "Ethiopia": ["ethiopia", "addis ababa"],
    "Fiji": ["fiji"],
    "Finland": ["finland", "helsinki"],
    "France": ["france", "paris", "lyon", "marseille"],
    "Gabon": ["gabon"],
    "Gambia": ["gambia"],
    "Georgia": ["georgia", "tbilisi"],
    "Germany": ["germany", "berlin", "munich", "münchen", "hamburg", "frankfurt"],
    "Ghana": ["ghana", "accra"],
    "Greece": ["greece", "athens"],
    "Grenada": ["grenada"],
    "Guatemala": ["guatemala"],
    "Guinea": ["guinea", "conakry"],
    "Guinea-Bissau": ["guinea-bissau"],
    "Guyana": ["guyana"],
    "Haiti": ["haiti"],
    "Honduras": ["honduras", "tegucigalpa"],
    "Hungary": ["hungary", "budapest"],
    "Iceland": ["iceland", "reykjavik"],
    "India": ["india", "mumbai", "bangalore", "bengaluru", "delhi", "hyderabad", "chennai", "pune", "kolkata"],
    "Indonesia": ["indonesia", "jakarta"],
    "Iran": ["iran", "tehran"],
    "Iraq": ["iraq", "baghdad"],
    "Ireland": ["ireland", "dublin"],
    "Israel": ["israel", "tel aviv"],
    "Italy": ["italy", "rome", "roma", "milan", "milano"],
    "Jamaica": ["jamaica", "kingston"],
    "Japan": ["japan", "tokyo", "osaka", "yokohama"],
    "Jordan": ["jordan", "amman"],
    "Kazakhstan": ["kazakhstan", "almaty", "astana"],
    "Kenya": ["kenya", "nairobi"],
    "Kiribati": ["kiribati"],
    "North Korea": ["north korea"],
    "South Korea": ["south korea", "korea", "seoul"],
    "Kuwait": ["kuwait"],
    "Kyrgyzstan": ["kyrgyzstan", "bishkek"],
    "Laos": ["laos", "vientiane"],
    "Latvia": ["latvia", "riga"],
    "Lebanon": ["lebanon", "beirut"],
    "Lesotho": ["lesotho"],
    "Liberia": ["liberia"],
    "Libya": ["libya", "tripoli"],
    "Liechtenstein": ["liechtenstein"],
    "Lithuania": ["lithuania", "vilnius"],
    "Luxembourg": ["luxembourg"],
    "Madagascar": ["madagascar"],
    "Malawi": ["malawi"],
    "Malaysia": ["malaysia", "kuala lumpur"],
    "Maldives": ["maldives"],
    "Mali": ["mali"],
    "Malta": ["malta"],
    "Marshall Islands": ["marshall islands"],
    "Mauritania": ["mauritania"],
    "Mauritius": ["mauritius"],
    "Mexico": ["mexico", "mexico city", "ciudad de mexico", "guadalajara", "monterrey"],
    "Micronesia": ["micronesia"],
    "Moldova": ["moldova", "chisinau"],
    "Monaco": ["monaco"],
    "Mongolia": ["mongolia", "ulaanbaatar"],
    "Montenegro": ["montenegro", "podgorica"],
    "Morocco": ["morocco", "casablanca", "rabat"],
    "Mozambique": ["mozambique", "maputo"],
    "Myanmar": ["myanmar", "burma", "yangon"],
    "Namibia": ["namibia", "windhoek"],
    "Nauru": ["nauru"],
    "Nepal": ["nepal", "kathmandu"],
    "Netherlands": ["netherlands", "holland", "amsterdam", "rotterdam", "the hague"],
    "New Zealand": ["new zealand", "auckland", "wellington"],
    "Nicaragua": ["nicaragua", "managua"],
    "Niger": ["niger"],
    "Nigeria": ["nigeria", "lagos", "abuja"],
    "North Macedonia": ["north macedonia", "macedonia", "skopje"],
    "Norway": ["norway", "oslo"],
    "Oman": ["oman", "muscat"],
    "Pakistan": ["pakistan", "karachi", "lahore", "islamabad"],
    "Palau": ["palau"],
    "Palestine": ["palestine", "ramallah"],
    "Panama": ["panama"],
    "Papua New Guinea": ["papua new guinea"],
    "Paraguay": ["paraguay", "asuncion"],
    "Peru": ["peru", "lima"],
    "Philippines": ["philippines", "manila", "cebu"],
    "Poland": ["poland", "warsaw", "krakow", "kraków"],
    "Portugal": ["portugal", "lisbon", "lisboa"],
    "Qatar": ["qatar", "doha"],
    "Romania": ["romania", "bucharest"],
    "Russia": ["russia", "russian federation", "moscow", "st petersburg"],
    "Rwanda": ["rwanda", "kigali"],
    "Saint Kitts and Nevis": ["saint kitts and nevis", "st kitts"],
    "Saint Lucia": ["saint lucia", "st lucia"],
    "Saint Vincent and the Grenadines": ["saint vincent and the grenadines", "st vincent"],
    "Samoa": ["samoa"],
    "San Marino": ["san marino"],
    "São Tomé and Príncipe": ["são tomé and príncipe", "sao tome"],
    "Saudi Arabia": ["saudi arabia", "riyadh", "jeddah"],
    "Senegal": ["senegal", "dakar"],
    "Serbia": ["serbia", "belgrade"],
    "Seychelles": ["seychelles"],
    "Sierra Leone": ["sierra leone"],
    "Singapore": ["singapore"],
    "Slovakia": ["slovakia", "bratislava"],
    "Slovenia": ["slovenia", "ljubljana"],
    "Solomon Islands": ["solomon islands"],
    "Somalia": ["somalia", "mogadishu"],
    "South Africa": ["south africa", "johannesburg", "cape town", "durban", "pretoria"],
    "South Sudan": ["south sudan", "juba"],
    "Spain": ["spain", "madrid", "barcelona", "valencia"],
    "Sri Lanka": ["sri lanka", "colombo"],
    "Sudan": ["sudan", "khartoum"],
    "Suriname": ["suriname"],
    "Sweden": ["sweden", "stockholm", "gothenburg"],
    "Switzerland": ["switzerland", "zurich", "zürich", "geneva", "genève", "bern"],
    "Syria": ["syria", "damascus"],
    "Taiwan": ["taiwan", "taipei"],
    "Tajikistan": ["tajikistan"],
    "Tanzania": ["tanzania", "dar es salaam"],
    "Thailand": ["thailand", "bangkok"],
    "Timor-Leste": ["timor-leste", "east timor"],
    "Togo": ["togo"],
    "Tonga": ["tonga"],
    "Trinidad and Tobago": ["trinidad and tobago", "trinidad"],
    "Tunisia": ["tunisia", "tunis"],
    "Turkey": ["turkey", "türkiye", "istanbul", "ankara"],
    "Turkmenistan": ["turkmenistan"],
    "Tuvalu": ["tuvalu"],
    "Uganda": ["uganda", "kampala"],
    "Ukraine": ["ukraine", "kyiv", "kiev"],
    "United Arab Emirates": ["united arab emirates", "uae", "dubai", "abu dhabi"],
    "United Kingdom": ["united kingdom", "uk", "england", "scotland", "wales",
                        "london", "manchester", "birmingham", "edinburgh", "bristol", "leeds"],
    "United States": ["united states", "usa", "u.s.", "u.s.a."],
    "Uruguay": ["uruguay", "montevideo"],
    "Uzbekistan": ["uzbekistan", "tashkent"],
    "Vanuatu": ["vanuatu"],
    "Venezuela": ["venezuela", "caracas"],
    "Vietnam": ["vietnam", "viet nam", "ho chi minh", "hanoi"],
    "Yemen": ["yemen"],
    "Zambia": ["zambia", "lusaka"],
    "Zimbabwe": ["zimbabwe", "harare"],
}

REGIONS = {
    "Latin America": ["latin america", "latam"],
    "South America": ["south america"],
    "North America": ["north america"],
    "Central America": ["central america"],
    "Europe": ["europe", "european union"],
    "Asia": ["asia"],
    "Southeast Asia": ["southeast asia", "south east asia"],
    "East Asia": ["east asia"],
    "South Asia": ["south asia"],
    "Middle East": ["middle east", "mena"],
    "Africa": ["africa"],
    "East Africa": ["east africa"],
    "West Africa": ["west africa"],
    "Oceania": ["oceania"],
    "Caribbean": ["caribbean"],
    "Worldwide": ["worldwide", "global", "anywhere in the world"],
    "EMEA": ["emea"],
    "APAC": ["apac", "asia pacific", "asia-pacific"],
    "Americas": ["americas"],
}

US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
    "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
    "WI", "WY", "DC",
}

# ============================================================
# Currency symbols and ISO codes for salary extraction
# ============================================================
CURRENCY_SYMBOLS = [
    "$", "€", "£", "¥", "₹", "₩", "₽", "₺", "₴", "₦", "₱", "₫", "₸",
    "₵", "₡", "﷼", "৳", "₮", "₲", "₪", "₭", "₾", "₼", "₣",
    "R$", "S/", "C$", "J$", "NT$", "HK$", "A$", "NZ$", "S$",
    "kr", "Rp", "RM", "Kč", "zł", "lei", "лв", "Ft", "Rs",
]

CURRENCY_CODES = [
    "USD", "EUR", "GBP", "JPY", "CNY", "INR", "AUD", "CAD", "CHF", "HKD",
    "SGD", "NZD", "KRW", "SEK", "NOK", "DKK", "MXN", "BRL", "ZAR", "RUB",
    "TRY", "PLN", "THB", "IDR", "MYR", "PHP", "CZK", "ILS", "CLP", "COP",
    "PEN", "ARS", "VND", "UAH", "RON", "HUF", "EGP", "NGN", "KES", "PKR",
    "BDT", "LKR", "GHS", "TZS", "UGX", "MAD", "TWD", "SAR", "AED", "QAR",
    "KWD", "BHD", "OMR", "JOD", "GEL",
]


# ============================================================
# Text normalization
# ============================================================

def _normalize_text(text: str) -> str:
    """Fix scraped JD text where words are glued together (e.g. 'LocationRemote')."""
    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    text = re.sub(r'(\d)([A-Z])', r'\1 \2', text)
    text = re.sub(r'([.!?])([A-Z])', r'\1 \2', text)
    text = re.sub(r'\s+', ' ', text)
    return text


# ============================================================
# Extraction functions
# ============================================================

def _extract_job_type(text_lower: str) -> Optional[str]:
    """Extract job type: remote, hybrid, or onsite."""
    hybrid_signals = [
        r'\bhybrid\b',
        r'\d+\s*days?\s+in[\s-]?office', r'\d+\s*days?\s+on[\s-]?site',
        r'\d+\s*days?\s+remote', r'in[\s-]?office\s+\d',
        r'mix\s+of\s+remote\s+and',
        r'partially\s+remote', r'flex\s+remote',
    ]
    remote_signals = [
        r'fully\s+remote', r'100%\s+remote', r'remote[\s-]?only',
        r'remote\s+first', r'remote[\s-]?friendly',
        r'work\s+from\s+anywhere', r'work\s+from\s+home',
        r'\bwfh\b', r'\bwfa\b',
        r'\bremote\b',
        r'distributed\s+team', r'location[\s-]?independent',
        r'work\s+remotely', r'remote\s+position', r'remote\s+role',
        r'remote\s+job', r'telecommute', r'telework',
    ]
    onsite_signals = [
        r'on[\s-]?site\s+only', r'in[\s-]?office\s+only',
        r'must\s+work\s+on[\s-]?site', r'must\s+be\s+on[\s-]?site',
        r'no\s+remote', r'in[\s-]?person\s+only',
        r'office[\s-]?based', r'on[\s-]?site\s+position',
        r'on[\s-]?site\s+role',
        r'\bwfo\b',
    ]

    hybrid_count = sum(1 for p in hybrid_signals if re.search(p, text_lower))
    remote_count = sum(1 for p in remote_signals if re.search(p, text_lower))
    onsite_count = sum(1 for p in onsite_signals if re.search(p, text_lower))

    if hybrid_count > 0:
        return "hybrid"
    if onsite_count > 0 and remote_count == 0:
        return "onsite"
    if remote_count > 0:
        return "remote"
    return None


def _extract_employment_type(text_lower: str) -> Optional[str]:
    """Extract employment relationship (full-time, contract, internship, etc.)."""
    employment_patterns = {
        "internship": [
            r"\bintern(ship)?\b",
            r"\bco-?op\b",
            r"\bapprenticeship\b",
        ],
        "contract": [
            r"\bcontract\b",
            r"\bcontractor\b",
            r"\bfixed[-\s]?term\b",
            r"\b1099\b",
        ],
        "temporary": [
            r"\btemporary\b",
            r"\btemp\b",
            r"\bseasonal\b",
        ],
        "freelance": [
            r"\bfreelance\b",
            r"\bconsultant\b",
        ],
        "part-time": [
            r"\bpart[-\s]?time\b",
        ],
        "full-time": [
            r"\bfull[-\s]?time\b",
        ],
    }

    for employment_type, patterns in employment_patterns.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                return employment_type
    return None


def _extract_salary(text: str) -> Optional[str]:
    """Extract salary range, supporting global currency symbols and ISO codes."""
    escaped_symbols = sorted(
        [re.escape(s) for s in CURRENCY_SYMBOLS],
        key=len, reverse=True,
    )
    sym_pattern = "|".join(escaped_symbols)
    code_pattern = "|".join(CURRENCY_CODES)

    patterns = [
        # Symbol + range: $2,000 – $4,500/month
        rf'(?:{sym_pattern})\s*[\d,.]+\s*[kKLlMm]?\s*[–\-—to/]+\s*(?:{sym_pattern})?\s*[\d,.]+\s*[kKLlMm]?\s*(?:\s*/?\s*(?:year|yr|annual|annum|month|mo|hour|hr|week|wk|p\.?a\.?))?',
        # Code + range: USD 2,000 - 4,500
        rf'(?:{code_pattern})\s*[\d,.]+\s*[kKLlMm]?\s*[–\-—to/]+\s*(?:{code_pattern})?\s*[\d,.]+\s*[kKLlMm]?\s*(?:\s*/?\s*(?:year|yr|annual|annum|month|mo|hour|hr|week|wk|p\.?a\.?))?',
        # Range then code: 2,000 - 4,500 USD
        rf'[\d,.]+\s*[kKLlMm]?\s*[–\-—to/]+\s*[\d,.]+\s*[kKLlMm]?\s*(?:{code_pattern})\s*(?:\s*/?\s*(?:year|yr|annual|annum|month|mo|hour|hr|week|wk|p\.?a\.?))?',
        # Symbol + single: $120,000/year
        rf'(?:{sym_pattern})\s*[\d,.]+\s*[kKLlMm]?\s*(?:\s*/?\s*(?:year|yr|annual|annum|month|mo|hour|hr|week|wk|p\.?a\.?))',
        # Code + single: USD 120,000
        rf'(?:{code_pattern})\s+[\d,.]+\s*[kKLlMm]?',
    ]

    for p in patterns:
        match = re.search(p, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
    return None


def _extract_location(text: str, text_lower: str) -> Optional[str]:
    """Extract company/base-office location instead of remote eligibility regions."""
    location_hints = [
        r"(?:headquartered|headquarters)\s+in\s+([A-Z][A-Za-z.\- ]+(?:,\s*[A-Z]{2})?)",
        r"(?:office|offices)\s+in\s+([A-Z][A-Za-z.\- ]+(?:,\s*[A-Z]{2})?)",
        r"(?:based|located)\s+in\s+([A-Z][A-Za-z.\- ]+(?:,\s*[A-Z]{2})?)",
        r"location\s*:\s*([A-Z][A-Za-z.\- ]+(?:,\s*[A-Z]{2})?)",
    ]
    disallowed_context = re.compile(
        r"\b(remote|hybrid|onsite|on-site|work from home|wfh|wfa|timezone|time zone|eligible|anywhere|worldwide|global|emea|apac|latam|visa)\b",
        re.IGNORECASE,
    )

    for pattern in location_hints:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        candidate = match.group(1).strip(" .,;:-")
        if candidate and not disallowed_context.search(candidate):
            return candidate

    line_patterns = [
        r"^(?:location|office location|company location)\s*:\s*(.+)$",
        r"^(?:headquarters|hq)\s*:\s*(.+)$",
    ]
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        for pattern in line_patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if not match:
                continue
            candidate = match.group(1).strip(" .,;:-")
            if candidate and not disallowed_context.search(candidate):
                return candidate

    for m in re.finditer(r"\b([A-Z][a-zA-Z.\- ]+),\s*([A-Z]{2})\b", text):
        city = m.group(1).strip()
        state_code = m.group(2)
        snippet = text[max(0, m.start() - 50): m.end() + 50]
        if state_code in US_STATES and not disallowed_context.search(snippet):
            return f"{city}, {state_code}"

    for nation, aliases in NATIONS.items():
        for alias in aliases:
            match = re.search(rf"\b{re.escape(alias)}\b", text_lower)
            if not match:
                continue
            snippet = text_lower[max(0, match.start() - 40): match.end() + 40]
            if disallowed_context.search(snippet):
                continue
            return nation

    return None


# ============================================================
# Public API
# ============================================================

def extract_job_info(text: str) -> Dict[str, Optional[str]]:
    """Extract job_type, employment_type, location, and salary_range from JD text.

    Returns a dict with keys: job_type, employment_type, location, salary_range.
    Any field that can't be extracted is set to None.
    """
    text = _normalize_text(text)
    text_lower = text.lower()

    return {
        "job_type": _extract_job_type(text_lower),
        "employment_type": _extract_employment_type(text_lower),
        "location": _extract_location(text, text_lower),
        "salary_range": _extract_salary(text),
    }
