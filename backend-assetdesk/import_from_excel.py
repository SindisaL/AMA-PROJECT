# import_assets_excel.py
import pandas as pd
from datetime import datetime, date
from typing import Optional, Any

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import init_db, SessionLocal
from models import Asset

# -----------------------
# CONFIG
# -----------------------
EXCEL_FILE = "ICT_Asset_Register.xlsx"
SHEET_NAME: Any = 0  # 0 = first sheet, or "Sheet1"
DEFAULT_LIFESPAN_YEARS = 5

# If True: update existing asset rows (by asset_tag), otherwise skip duplicates
UPDATE_EXISTING = False


# -----------------------
# HELPERS
# -----------------------
def norm_col(name: Any) -> str:
    """Normalize a column header to a comparable key."""
    if name is None:
        return ""
    return (
        str(name)
        .strip()
        .lower()
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
    )


def parse_date(value: Any) -> Optional[date]:
    """Safely convert Excel/strings to a Python date or None."""
    if value is None or (isinstance(value, float) and pd.isna(value)) or pd.isna(value):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()

    # try pandas date parsing
    try:
        d = pd.to_datetime(value, errors="coerce")
        if pd.isna(d):
            return None
        return d.date()
    except Exception:
        return None


def to_str(value: Any) -> Optional[str]:
    if value is None or pd.isna(value):
        return None
    s = str(value).strip()
    return s if s else None


def to_float(value: Any) -> Optional[float]:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_int(value: Any) -> Optional[int]:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def pick(row: dict, header_map: dict, *candidates: str) -> Any:
    """
    Pick the first matching column from candidates.
    candidates are normalized names (no spaces/underscores).
    """
    for c in candidates:
        idx = header_map.get(c)
        if idx is not None:
            return row[idx]
    return None


# -----------------------
# MAIN IMPORT
# -----------------------
def import_assets_from_excel():
    init_db()

    df = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_NAME, dtype=object)
    if df.empty:
        print("Excel is empty. Nothing to import.")
        return

    # Build header map: normalized header -> column index
    raw_headers = list(df.columns)
    header_map = {norm_col(h): i for i, h in enumerate(raw_headers)}

    print("Columns found in Excel:")
    print(raw_headers)

    # Preload existing keys to prevent duplicates
    db: Session = SessionLocal()
    try:
        existing_assets = db.query(Asset).all()
        existing_tags = {(a.asset_tag or "").strip().lower() for a in existing_assets if a.asset_tag}
        existing_serials = {(a.serial_number or "").strip().lower() for a in existing_assets if a.serial_number}

        inserted = 0
        updated = 0
        skipped_blank = 0
        skipped_duplicates = 0
        errors = 0

        for _, r in df.iterrows():
            row = r.tolist()

            # Flexible column matching (supports different header names)
            asset_tag = to_str(pick(row, header_map, "assettag", "assetid", "id", "assetcode"))
            category = to_str(pick(row, header_map, "category", "type", "assettype"))
            brand = to_str(pick(row, header_map, "brand", "make", "manufacturer"))
            model = to_str(pick(row, header_map, "model", "description", "assetdescription"))
            serial = to_str(pick(row, header_map, "serialnumber", "serial", "sn"))
            hostname = to_str(pick(row, header_map, "hostname", "computername"))
            status = to_str(pick(row, header_map, "status")) or "In Use"
            assigned_to = to_str(pick(row, header_map, "assignedto", "user", "owner", "allocatedto"))
            department = to_str(pick(row, header_map, "department", "dept"))
            location = to_str(pick(row, header_map, "location", "site", "loc"))
            purchase_date = parse_date(pick(row, header_map, "purchasedate", "purchase", "date"))
            warranty_expiry = parse_date(pick(row, header_map, "warrantyexpiry", "warranty", "warrantyend"))
            cost = to_float(pick(row, header_map, "cost", "value", "valuezar", "amount"))
            useful_life_years = to_int(pick(row, header_map, "usefullifeyears", "usefullife", "lifespan")) or DEFAULT_LIFESPAN_YEARS
            notes = to_str(pick(row, header_map, "notes", "comment", "remarks"))

            # Skip fully blank lines
            if not asset_tag and not category and not serial and not model:
                skipped_blank += 1
                continue

            # asset_tag is your primary key in the UI/backend logic
            # if missing, fall back to serial (still not ideal)
            if not asset_tag:
                asset_tag = serial

            if not asset_tag:
                skipped_blank += 1
                continue

            tag_key = asset_tag.strip().lower()
            serial_key = serial.strip().lower() if serial else None

            # Duplicate handling
            if tag_key in existing_tags:
                if UPDATE_EXISTING:
                    # update existing asset by asset_tag
                    asset = db.query(Asset).filter(Asset.asset_tag == asset_tag).first()
                    if asset:
                        asset.category = category or asset.category or "Unknown"
                        asset.brand = brand
                        asset.model = model
                        asset.serial_number = serial
                        asset.hostname = hostname
                        asset.status = status
                        asset.assigned_to = assigned_to
                        asset.department = department
                        asset.location = location
                        asset.purchase_date = purchase_date
                        asset.warranty_expiry = warranty_expiry
                        asset.cost = cost
                        asset.useful_life_years = useful_life_years
                        asset.notes = notes
                        updated += 1
                        continue

                skipped_duplicates += 1
                continue

            if serial_key and serial_key in existing_serials:
                skipped_duplicates += 1
                continue

            # Insert
            asset = Asset(
                asset_tag=asset_tag,
                category=category or "Unknown",
                brand=brand,
                model=model,
                serial_number=serial,
                hostname=hostname,
                status=status,
                assigned_to=assigned_to,
                department=department,
                location=location,
                purchase_date=purchase_date,
                warranty_expiry=warranty_expiry,
                cost=cost,
                useful_life_years=useful_life_years,
                notes=notes,
            )

            db.add(asset)
            try:
                db.flush()  # catch integrity errors early
                inserted += 1
                existing_tags.add(tag_key)
                if serial_key:
                    existing_serials.add(serial_key)
            except IntegrityError as ie:
                db.rollback()
                errors += 1
                print(f"[DB ERROR] Could not insert asset_tag={asset_tag} serial={serial}: {ie}")

        db.commit()

        print("\n=== IMPORT SUMMARY ===")
        print(f"Inserted: {inserted}")
        print(f"Updated: {updated} (UPDATE_EXISTING={UPDATE_EXISTING})")
        print(f"Skipped duplicates: {skipped_duplicates}")
        print(f"Skipped blank rows: {skipped_blank}")
        print(f"Errors: {errors}")

    finally:
        db.close()


if __name__ == "__main__":
    import_assets_from_excel()
