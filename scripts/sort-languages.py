import json
import os
import unicodedata
from typing import Dict, List

# Get the directory where this script is located
script_dir = os.path.dirname(os.path.abspath(__file__))
base_path = os.path.join(script_dir, "..", "lib", "i18n", "dictionaries")


def normalize_for_sort(s: str) -> str:
    """Remove accents for sorting purposes"""
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    ).lower()


def sort_languages(languages: List[str]) -> List[str]:
    """Sort languages by their normalized (accent-free) form"""
    return sorted(languages, key=normalize_for_sort)


# Language to flag mapping
language_flags: Dict[str, str] = {
    # English
    "Arabic": "🇸🇦",
    "Danish": "🇩🇰",
    "Dutch": "🇳🇱",
    "English": "🇬🇧",
    "Finnish": "🇫🇮",
    "French": "🇫🇷",
    "German": "🇩🇪",
    "Greek": "🇬🇷",
    "Hebrew": "🇮🇱",
    "Hindi": "🇮🇳",
    "Italian": "🇮🇹",
    "Japanese": "🇯🇵",
    "Korean": "🇰🇷",
    "Malay": "🇲🇾",
    "Mandarin Chinese": "🇨🇳",
    "Norwegian": "🇳🇴",
    "Polish": "🇵🇱",
    "Portuguese": "🇵🇹",
    "Russian": "🇷🇺",
    "Spanish": "🇪🇸",
    "Swahili": "🇰🇪",
    "Swedish": "🇸🇪",
    "Turkish": "🇹🇷",
    # Spanish
    "Alemán": "🇩🇪",
    "Árabe": "🇸🇦",
    "Chino mandarín": "🇨🇳",
    "Coreano": "🇰🇷",
    "Danés": "🇩🇰",
    "Español": "🇪🇸",
    "Finlandés": "🇫🇮",
    "Francés": "🇫🇷",
    "Griego": "🇬🇷",
    "Hebreo": "🇮🇱",
    "Holandés": "🇳🇱",
    "Inglés": "🇬🇧",
    "Italiano": "🇮🇹",
    "Japonés": "🇯🇵",
    "Malayo": "🇲🇾",
    "Noruego": "🇳🇴",
    "Polaco": "🇵🇱",
    "Portugués": "🇵🇹",
    "Ruso": "🇷🇺",
    "Suajili": "🇰🇪",
    "Sueco": "🇸🇪",
    "Turco": "🇹🇷",
    # German
    "Arabisch": "🇸🇦",
    "Dänisch": "🇩🇰",
    "Deutsch": "🇩🇪",
    "Englisch": "🇬🇧",
    "Finnisch": "🇫🇮",
    "Französisch": "🇫🇷",
    "Griechisch": "🇬🇷",
    "Hebräisch": "🇮🇱",
    "Italienisch": "🇮🇹",
    "Japanisch": "🇯🇵",
    "Koreanisch": "🇰🇷",
    "Malaiisch": "🇲🇾",
    "Mandarin-Chinesisch": "🇨🇳",
    "Niederländisch": "🇳🇱",
    "Norwegisch": "🇳🇴",
    "Polnisch": "🇵🇱",
    "Portugiesisch": "🇵🇹",
    "Russisch": "🇷🇺",
    "Schwedisch": "🇸🇪",
    "Spanisch": "🇪🇸",
    "Suaheli": "🇰🇪",
    "Türkisch": "🇹🇷",
    # French
    "Allemand": "🇩🇪",
    "Anglais": "🇬🇧",
    "Arabe": "🇸🇦",
    "Chinois mandarin": "🇨🇳",
    "Coréen": "🇰🇷",
    "Danois": "🇩🇰",
    "Espagnol": "🇪🇸",
    "Finnois": "🇫🇮",
    "Français": "🇫🇷",
    "Grec": "🇬🇷",
    "Hébreu": "🇮🇱",
    "Italien": "🇮🇹",
    "Japonais": "🇯🇵",
    "Malais": "🇲🇾",
    "Néerlandais": "🇳🇱",
    "Norvégien": "🇳🇴",
    "Polonais": "🇵🇱",
    "Portugais": "🇵🇹",
    "Russe": "🇷🇺",
    "Suédois": "🇸🇪",
    "Turc": "🇹🇷",
    # Italian
    "Arabo": "🇸🇦",
    "Cinese mandarino": "🇨🇳",
    "Danese": "🇩🇰",
    "Ebraico": "🇮🇱",
    "Finlandese": "🇫🇮",
    "Francese": "🇫🇷",
    "Giapponese": "🇯🇵",
    "Greco": "🇬🇷",
    "Inglese": "🇬🇧",
    "Malese": "🇲🇾",
    "Norvegese": "🇳🇴",
    "Olandese": "🇳🇱",
    "Polacco": "🇵🇱",
    "Portoghese": "🇵🇹",
    "Russo": "🇷🇺",
    "Spagnolo": "🇪🇸",
    "Svedese": "🇸🇪",
    "Tedesco": "🇩🇪",
    # Danish
    "Arabisk": "🇸🇦",
    "Dansk": "🇩🇰",
    "Engelsk": "🇬🇧",
    "Finsk": "🇫🇮",
    "Fransk": "🇫🇷",
    "Græsk": "🇬🇷",
    "Hebraisk": "🇮🇱",
    "Hollandsk": "🇳🇱",
    "Italiensk": "🇮🇹",
    "Japansk": "🇯🇵",
    "Koreansk": "🇰🇷",
    "Malajisk": "🇲🇾",
    "Mandarin-kinesisk": "🇨🇳",
    "Norsk": "🇳🇴",
    "Polsk": "🇵🇱",
    "Portugisisk": "🇵🇹",
    "Russisk": "🇷🇺",
    "Spansk": "🇪🇸",
    "Svensk": "🇸🇪",
    "Tyrkisk": "🇹🇷",
    "Tysk": "🇩🇪",
}

templates: Dict[str, Dict[str, str]] = {
    "en.json": {
        "intro": "Voice cloning supports the following 23 languages:",
        "last_connector": "and ",
        "separator": ",",
    },
    "es.json": {
        "intro": "La clonación de voz soporta los siguientes 23 idiomas:",
        "last_connector": "y ",
        "separator": ",",
    },
    "de.json": {
        "intro": "Das Stimmklonen unterstützt die folgenden 23 Sprachen:",
        "last_connector": "und ",
        "separator": ",",
    },
    "fr.json": {
        "intro": "Le clonage vocal supporte les 23 langues suivantes :",
        "last_connector": "et ",
        "separator": ",",
    },
    "it.json": {
        "intro": "La clonazione vocale supporta le seguenti 23 lingue:",
        "last_connector": "e ",
        "separator": ",",
    },
    "da.json": {
        "intro": "Stemmekloning understøtter følgende 23 sprog:",
        "last_connector": "og ",
        "separator": ",",
    },
}

languages_by_file: Dict[str, List[str]] = {
    "en.json": [
        "Arabic",
        "Danish",
        "Dutch",
        "English",
        "Finnish",
        "French",
        "German",
        "Greek",
        "Hebrew",
        "Hindi",
        "Italian",
        "Japanese",
        "Korean",
        "Malay",
        "Mandarin Chinese",
        "Norwegian",
        "Polish",
        "Portuguese",
        "Russian",
        "Spanish",
        "Swahili",
        "Swedish",
        "Turkish",
    ],
    "es.json": [
        "Alemán",
        "Árabe",
        "Chino mandarín",
        "Coreano",
        "Danés",
        "Español",
        "Finlandés",
        "Francés",
        "Griego",
        "Hebreo",
        "Hindi",
        "Holandés",
        "Inglés",
        "Italiano",
        "Japonés",
        "Malayo",
        "Noruego",
        "Polaco",
        "Portugués",
        "Ruso",
        "Suajili",
        "Sueco",
        "Turco",
    ],
    "de.json": [
        "Arabisch",
        "Dänisch",
        "Deutsch",
        "Englisch",
        "Finnisch",
        "Französisch",
        "Griechisch",
        "Hebräisch",
        "Hindi",
        "Italienisch",
        "Japanisch",
        "Koreanisch",
        "Malaiisch",
        "Mandarin-Chinesisch",
        "Niederländisch",
        "Norwegisch",
        "Polnisch",
        "Portugiesisch",
        "Russisch",
        "Schwedisch",
        "Spanisch",
        "Suaheli",
        "Türkisch",
    ],
    "fr.json": [
        "Allemand",
        "Anglais",
        "Arabe",
        "Chinois mandarin",
        "Coréen",
        "Danois",
        "Espagnol",
        "Finnois",
        "Français",
        "Grec",
        "Hébreu",
        "Hindi",
        "Italien",
        "Japonais",
        "Malais",
        "Néerlandais",
        "Norvégien",
        "Polonais",
        "Portugais",
        "Russe",
        "Suédois",
        "Swahili",
        "Turc",
    ],
    "it.json": [
        "Arabo",
        "Cinese mandarino",
        "Coreano",
        "Danese",
        "Ebraico",
        "Finlandese",
        "Francese",
        "Giapponese",
        "Greco",
        "Hindi",
        "Inglese",
        "Italiano",
        "Malese",
        "Norvegese",
        "Olandese",
        "Polacco",
        "Portoghese",
        "Russo",
        "Spagnolo",
        "Svedese",
        "Swahili",
        "Tedesco",
        "Turco",
    ],
    "da.json": [
        "Arabisk",
        "Dansk",
        "Engelsk",
        "Finsk",
        "Fransk",
        "Græsk",
        "Hebraisk",
        "Hindi",
        "Hollandsk",
        "Italiensk",
        "Japansk",
        "Koreansk",
        "Malajisk",
        "Mandarin-kinesisk",
        "Norsk",
        "Polsk",
        "Portugisisk",
        "Russisk",
        "Spansk",
        "Svensk",
        "Swahili",
        "Tyrkisk",
        "Tysk",
    ],
}


def main() -> None:
    """Main function to sort languages in all dictionary files"""
    for filename in templates.keys():
        filepath = os.path.join(base_path, filename)
        template = templates[filename]
        languages = languages_by_file[filename]

        # Sort alphabetically using normalized (accent-free) comparison
        sorted_languages = sort_languages(languages)

        print(f"{filename}: {sorted_languages[:5]}... {sorted_languages[-2:]}")

        # Build the answer string
        lines = [template["intro"], ""]
        for i, lang in enumerate(sorted_languages):
            flag = language_flags.get(lang, "🏳️")
            if i == len(sorted_languages) - 1:
                lines.append(f"{template['last_connector']}{flag} {lang}.")
            else:
                lines.append(f"{flag} {lang}{template['separator']}")

        answer = "\n".join(lines)

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        data["landing"]["faq"]["groups"][1]["questions"][3]["answer"] = answer

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print("\n✅ All files sorted with locale-aware sorting!")


if __name__ == "__main__":
    main()
