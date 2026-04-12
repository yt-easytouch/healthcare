import frappe

def main():
    prac = frappe.get_doc("Healthcare Practitioner", "HLC-PRAC-2026-00002")
    print("Practitioner:", prac.name)
    print("Practitioner schedules:", prac.practitioner_schedules)
