"""Admin jobs, run on the laptop against the database in MONGODB_URI.

  python -m app.admin staff <username> "<Full name>"   make or reset a moderator account (asks for the password)
  python -m app.admin import                           load src/data/<city>.json into the database
  python -m app.admin search-index                     create the Atlas Search index the chat uses
  python -m app.admin status                           counts per collection

Passwords are typed into the prompt, never passed on the command line or stored in plain text.
"""
from __future__ import annotations

import getpass
import sys

from . import auth, cities
from .db import get_db


def main(argv: list[str]) -> None:
    if not argv:
        print(__doc__)
        return
    cmd = argv[0]
    if cmd == "staff":
        username, name = argv[1], argv[2]
        pw = getpass.getpass(f"Password for {username} (10+ characters): ")
        if pw != getpass.getpass("Again: "):
            sys.exit("passwords differ")
        u = auth.make_staff(username, name, pw)
        print(f"ok: {u['username']} ({u['name']}) roles {', '.join(u['roles'])}")
    elif cmd == "import":
        for c in cities.CITY_IDS:
            if (cities.DATA_DIR / f"{c}.json").exists():
                print(f"{c}: {cities.import_city(c)} places")
    elif cmd == "search-index":
        from pymongo.operations import SearchIndexModel

        model = SearchIndexModel(name="chunks", definition={"mappings": {"dynamic": False, "fields": {
            "text": {"type": "string", "analyzer": "lucene.standard"},
            "city": {"type": "token"}, "lang": {"type": "token"}}}})
        print(get_db().chunks.create_search_index(model))
    elif cmd == "status":
        db = get_db()
        for n in sorted(db.list_collection_names()):
            print(f"{n}: {db[n].count_documents({})}")
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
