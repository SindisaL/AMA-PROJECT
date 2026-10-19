# ============================================================
# AMA - RECONCILED ICT ASSET REGISTER IMPORTER
# ============================================================

from pathlib import Path
import sys
import sqlite3
import pandas as pd
from datetime import date

# ------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

EXCEL_FILE = BASE_DIR / "ICT-Asset-Register_Updated.xlsx"

SHEET_NAME = "Main_Asset_Register"

TEST_DATABASE = BASE_DIR / "assetdesk_import_test.db"

DEFAULT_LIFESPAN_YEARS = 5


# ------------------------------------------------------------
# SAFETY VALIDATION
# ------------------------------------------------------------

def validate_configuration():

    print("\n=== AMA IMPORT CONFIGURATION ===")

    if not EXCEL_FILE.is_file():
        raise FileNotFoundError(
            f"Excel register not found: {EXCEL_FILE}"
        )

    if not TEST_DATABASE.is_file():
        raise FileNotFoundError(
            f"Test database not found: {TEST_DATABASE}"
        )

    if TEST_DATABASE.name != "assetdesk_import_test.db":
        raise RuntimeError(
            "Import blocked: Incorrect database selected."
        )

    with sqlite3.connect(TEST_DATABASE) as conn:
        integrity = conn.execute(
            "PRAGMA integrity_check"
        ).fetchone()[0]

        if integrity != "ok":
            raise RuntimeError(
                f"Database integrity check failed: {integrity}"
            )

    print("Excel register:", EXCEL_FILE.name)
    print("Worksheet:", SHEET_NAME)
    print("Database:", TEST_DATABASE.name)
    print("Default lifespan:", DEFAULT_LIFESPAN_YEARS, "years")
    print("Database integrity:", integrity)

    print("\nConfiguration validation successful.")


# LOAD EXCEL SHEET WITH UPDATED DATA

# ------------------------------------------------------------
# LOAD AND VALIDATE EXCEL REGISTER
# ------------------------------------------------------------

def load_excel_register():

    print("\n=== LOADING RECONCILED ASSET REGISTER ===")

    # Read the authoritative worksheet
    df = pd.read_excel(
        EXCEL_FILE,
        sheet_name=SHEET_NAME,
        dtype=object
    )

    # Remove leading and trailing spaces from column headings
    df.columns = df.columns.str.strip()

    # Confirm that the asset tag column exists
    if "ASSET TAG NUMBER" not in df.columns:
        raise ValueError(
            "Required column 'ASSET TAG NUMBER' not found."
        )

    original_count = len(df)

    # Reject records without a valid asset tag
    tag_values = df["ASSET TAG NUMBER"].astype("string").str.strip()

    invalid_tags = (
        tag_values.isna()
        | tag_values.eq("").fillna(False)
    )

    if invalid_tags.any():
        raise ValueError(
            f"Import blocked: {invalid_tags.sum()} records "
            "have missing asset tags."
        )

    # Create a temporary normalized asset tag
    df["_asset_tag_key"] = tag_values.str.casefold()

    # Identify duplicate records
    duplicate_count = df["_asset_tag_key"].duplicated().sum()

    # Keep the first occurrence of each asset
    df = df.drop_duplicates(
        subset="_asset_tag_key",
        keep="first"
    ).copy()

    # Remove temporary validation column
    df = df.drop(columns=["_asset_tag_key"])

    final_count = len(df)

    print("Original Excel records:", original_count)
    print("Duplicate occurrences:", duplicate_count)
    print("Unique asset records:", final_count)

    # Validate the expected reconciliation totals
    if original_count != 817:
        raise ValueError(
            f"Unexpected Excel record count: {original_count}"
        )

    if duplicate_count != 8:
        raise ValueError(
            f"Unexpected duplicate count: {duplicate_count}"
        )

    if final_count != 809:
        raise ValueError(
            f"Expected 809 assets, found {final_count}"
        )

    print("\nExcel validation successful.")

    return df

# ------------------------------------------------------------
# CLASSIFY INITIAL ASSET STATUS
# ------------------------------------------------------------

def determine_asset_status(condition, assigned_to):

    # Normalise the condition value
    if pd.isna(condition):
        condition_text = ""
    else:
        condition_text = str(condition).strip().casefold()

    # Normalise employee allocation
    if pd.isna(assigned_to):
        employee_text = ""
    else:
        employee_text = str(assigned_to).strip()

    # Faulty assets take priority over allocation
    if condition_text == "not working":
        return "Faulty"

    # Uncertain condition requires verification
    if condition_text in ("bad", "poor", "fair"):
        return "Requires Review"

    # Working assets are classified by allocation
    if condition_text == "working":

        if employee_text:
            return "Active"

        return "Available"

    # Missing or unrecognised condition
    return "Requires Review"

# ------------------------------------------------------------
# CLEAN EXCEL VALUES
# ------------------------------------------------------------

def clean_value(value):

    if pd.isna(value):
        return None

    value = str(value).strip()

    if not value:
        return None

    return value

# ------------------------------------------------------------
# CALCULATE AMA ASSET LIFECYCLE
# ------------------------------------------------------------

def calculate_import_lifecycle(purchase_date, lifespan_years=None):

    if purchase_date is None:
        return None

    lifespan_years = lifespan_years or DEFAULT_LIFESPAN_YEARS

    today = date.today()
    total_days = lifespan_years * 365
    age_days = (today - purchase_date).days

    if age_days <= 0:
        return 100

    if age_days >= total_days:
        return 0

    remaining_ratio = 1 - (age_days / total_days)

    return int(round(remaining_ratio * 100))

# ------------------------------------------------------------
# TRANSFORM EXCEL RECORD INTO AMA ASSET
# ------------------------------------------------------------

def transform_asset(row):

    def get_value(column):
        return clean_value(row.get(column))

    def get_date(column):

        value = row.get(column)

        if pd.isna(value):
            return None

        parsed = pd.to_datetime(value, errors="coerce")

        if pd.isna(parsed):
            return None

        return parsed.date().isoformat()
    purchase_date_text = get_date("PURCHASE DATE")

    purchase_date_value = (
        date.fromisoformat(purchase_date_text)
        if purchase_date_text
        else None
    )

    life_remaining = calculate_import_lifecycle(
        purchase_date_value,
        DEFAULT_LIFESPAN_YEARS
    )
    asset = {
        "asset_tag": get_value("ASSET TAG NUMBER"),
        "asset_name": get_value("ASSET NAME"),
        "brand": get_value("BRAND NAME"),
        "asset_type": get_value("ITEM TYPE"),
        "category": get_value("ASSET CARTEGORY") or "Unknown",
        "serial_number": get_value("ASSET SERIAL NUMBER"),
        "assigned_to": get_value("EMPLYEE NAME"),
        "region": get_value("LOCATION - REGION"),
        "office_location": get_value("LOCTION OFFICE"),
        "location": get_value("LOCTION OFFICE"),
        "purchase_date": purchase_date_text,
        "operational_condition": get_value("CURRENT ASSET CONDITION"),
        "physical_condition": get_value("CONDITION STATUS"),
        "condition_comments": get_value("COMMENTS ON ASSET CONDITION"),
        "verification_date": get_date("ASSET VERIFICATION DATE"),
        "verification_type": get_value("TYPE OF VERIFICATION"),
        "status": determine_asset_status(
            row.get("CURRENT ASSET CONDITION"),
            row.get("EMPLYEE NAME")
        ),
        "useful_life_years": DEFAULT_LIFESPAN_YEARS,
        "life_remaining_percent": life_remaining,
        "registered_by": None,
    }

    return asset

# ------------------------------------------------------------
# VALIDATE ALL TRANSFORMED ASSETS
# ------------------------------------------------------------

def validate_transformed_assets(df):

    print("\n=== VALIDATING ALL AMA ASSETS ===")

    assets = [
        transform_asset(row)
        for _, row in df.iterrows()
    ]

    print("Total transformed assets:", len(assets))

    if len(assets) != 809:
        raise ValueError(
            "Import blocked: Expected 809 transformed assets."
        )

    # Check asset tags
    tags = [
        asset["asset_tag"].strip().casefold()
        for asset in assets
        if asset["asset_tag"]
    ]

    if len(tags) != len(assets):
        raise ValueError(
            "Import blocked: Some assets have missing asset tags."
        )

    if len(tags) != len(set(tags)):
        raise ValueError(
            "Import blocked: Duplicate asset tags detected."
        )

    # Check serial numbers
    serials = [
        asset["serial_number"].strip().casefold()
        for asset in assets
        if asset["serial_number"]
    ]

    if len(serials) != len(set(serials)):
        raise ValueError(
            "Import blocked: Duplicate serial numbers detected."
        )

    # Check required fields
    for asset in assets:
        if not asset["category"]:
            raise ValueError(
                f"Missing category: {asset['asset_tag']}"
            )

        if not asset["status"]:
            raise ValueError(
                f"Missing status: {asset['asset_tag']}"
            )

    # Check date parsing
    source_purchase_dates = int(
        df["PURCHASE DATE"].notna().sum()
    )

    parsed_purchase_dates = sum(
        asset["purchase_date"] is not None
        for asset in assets
    )

    if source_purchase_dates != parsed_purchase_dates:
        raise ValueError(
            "Import blocked: Some purchase dates could not be parsed."
        )

    print("Unique asset tags:", len(set(tags)))
    print("Unique serial numbers:", len(set(serials)))
    print("Purchase dates validated:", parsed_purchase_dates)

    print("\nAll transformed assets passed validation.")

    return assets
# ------------------------------------------------------------
# IMPORT RECONCILED ASSETS INTO TEST DATABASE
# ------------------------------------------------------------

def import_assets_to_test_database(assets):

    print("\n=== AMA TEST DATABASE IMPORT ===")

    if TEST_DATABASE.name != "assetdesk_import_test.db":
        raise RuntimeError(
            "Import blocked: Incorrect database selected."
        )

    if len(assets) != 809:
        raise ValueError(
            "Import blocked: Expected exactly 809 assets."
        )

    # Columns permitted for import
    columns = [
        "asset_tag",
        "asset_name",
        "brand",
        "asset_type",
        "category",
        "serial_number",
        "assigned_to",
        "region",
        "office_location",
        "location",
        "purchase_date",
        "operational_condition",
        "physical_condition",
        "condition_comments",
        "verification_date",
        "verification_type",
        "status",
        "useful_life_years",
        "life_remaining_percent",
        "registered_by",
    ]

    column_names = ", ".join(columns)
    placeholders = ", ".join(["?"] * len(columns))

    insert_sql = (
        f"INSERT INTO assets ({column_names}) "
        f"VALUES ({placeholders})"
    )

    records = [
        tuple(asset[column] for column in columns)
        for asset in assets
    ]

    with sqlite3.connect(TEST_DATABASE) as conn:

        conn.execute("PRAGMA foreign_keys = ON")

        try:
            conn.execute("BEGIN IMMEDIATE")

            # Preserve existing user accounts
            users_before = conn.execute(
                "SELECT COUNT(*) FROM users"
            ).fetchone()[0]

            if users_before != 6:
                raise RuntimeError(
                    "Import blocked: Expected 6 user accounts."
                )

            # Remove outdated development events
            conn.execute("DELETE FROM asset_events")

            # Remove outdated asset records
            conn.execute("DELETE FROM assets")

            # Insert reconciled assets
            conn.executemany(insert_sql, records)

            # Verify results
            assets_after = conn.execute(
                "SELECT COUNT(*) FROM assets"
            ).fetchone()[0]

            users_after = conn.execute(
                "SELECT COUNT(*) FROM users"
            ).fetchone()[0]

            events_after = conn.execute(
                "SELECT COUNT(*) FROM asset_events"
            ).fetchone()[0]

            if assets_after != 809:
                raise RuntimeError(
                    "Import failed: Incorrect asset count."
                )

            if users_after != users_before:
                raise RuntimeError(
                    "Import failed: User accounts changed."
                )

            if events_after != 0:
                raise RuntimeError(
                    "Import failed: Old events remain."
                )

            integrity = conn.execute(
                "PRAGMA integrity_check"
            ).fetchone()[0]

            if integrity != "ok":
                raise RuntimeError(
                    "Import failed: Database integrity check."
                )

            conn.commit()

            print("Imported assets:", assets_after)
            print("Preserved users:", users_after)
            print("Remaining old events:", events_after)
            print("Database integrity:", integrity)
            print("\nTest database import successful.")

        except Exception:
            conn.rollback()
            print("\nIMPORT FAILED — TRANSACTION ROLLED BACK")
            raise
# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------

if __name__ == "__main__":

    validate_configuration()

    assets_df = load_excel_register()

    print("\n=== AMA IMPORT PREPARATION ===")
    print("Assets ready for transformation:", len(assets_df))
    print("Database changes: NONE")

    print("\n=== STATUS CLASSIFICATION TEST ===")

    test_cases = [
        ("Working", "Employee A"),
        ("Working", None),
        ("Not working", "Employee B"),
        ("Bad", None),
        (None, "Employee C"),
    ]

    for condition, employee in test_cases:
        status = determine_asset_status(condition, employee)

        print(
            f"Condition: {condition} | "
            f"Employee: {employee} | "
            f"AMA Status: {status}"
        )

    # --------------------------------------------------------
    # VALIDATE ALL ASSETS BEFORE DATABASE IMPORT
    # --------------------------------------------------------

    validated_assets = validate_transformed_assets(assets_df)

    print("\n=== AMA IMPORT READINESS ===")
    print("Validated assets:", len(validated_assets))
    print("Database changes: NONE")

    #--------------------------------------------------------
    # END OF MAIN
    #--------------------------------------------------------

    # --------------------------------------------------------
    # TEST EXCEL-TO-AMA TRANSFORMATION
    # --------------------------------------------------------

    print("\n=== AMA ASSET TRANSFORMATION TEST ===")

    first_asset = assets_df.iloc[0]

    transformed = transform_asset(first_asset)

    for field, value in transformed.items():
        print(f"{field}: {value}")

    print("\nTransformation test completed.")
    print("Database changes: NONE")


    # --------------------------------------------------------
    # CLASSIFY ALL RECONCILED ASSETS
    # --------------------------------------------------------

    print("\n=== AMA ASSET STATUS SUMMARY ===")

    assets_df["ama_status"] = assets_df.apply(
        lambda row: determine_asset_status(
            row["CURRENT ASSET CONDITION"],
            row["EMPLYEE NAME"]
        ),
        axis=1
    )

    status_summary = assets_df["ama_status"].value_counts()

    print(status_summary.to_string())

    print("\nTotal classified assets:", len(assets_df))

    if len(assets_df) != 809:
        raise ValueError(
            "Classification failed: Expected 809 assets."
        )

    if assets_df["ama_status"].isna().any():
        raise ValueError(
            "Classification failed: Some assets have no status."
        )

    print("Status classification completed successfully.")
    print("Database changes: NONE")

    # --------------------------------------------------------
    # CONTROLLED TEST DATABASE IMPORT
    # --------------------------------------------------------

    if len(sys.argv) > 1:

        if sys.argv[1:] != ["--apply-test"]:
            raise ValueError(
                "Invalid argument. Use --apply-test."
            )

        print("\n=== TEST IMPORT ACTIVATION ===")

        confirmation = input(
            "Type IMPORT-809 to confirm test database replacement: "
        )

        if confirmation != "IMPORT-809":
            print("Import cancelled.")
            sys.exit(0)

        import_assets_to_test_database(validated_assets)