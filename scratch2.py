import frappe
import json

def main():
    sites = ["murqo.com", "yool.com"]
    for site in sites:
        try:
            frappe.init(site=site)
            frappe.connect()
            prac = frappe.get_doc("Healthcare Practitioner", "HLC-PRAC-2026-00002")
            print("Found in site:", site)
            if not prac.practitioner_schedules:
                # Let's create a simple Schedule
                schedule = frappe.new_doc("Practitioner Schedule")
                schedule.schedule_name = "Default Schedule"
                
                # Add a time slot
                slot = schedule.append("time_slots", {})
                slot.day = "Monday"
                slot.from_time = "08:00:00"
                slot.to_time = "17:00:00"
                slot.maximum_appointments = 20
                
                # Add more days
                for day in ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
                    slot = schedule.append("time_slots", {})
                    slot.day = day
                    slot.from_time = "08:00:00"
                    slot.to_time = "17:00:00"
                    slot.maximum_appointments = 20
                
                schedule.save(ignore_permissions=True)
                
                # Assign to Practitioner
                prac.append("practitioner_schedules", {
                    "schedule": schedule.name
                })
                prac.save(ignore_permissions=True)
                frappe.db.commit()
                print("Added Schedule to", prac.name)
            else:
                print("Practitioner already has schedule")
            break
        except Exception as e:
            print("Error on site", site, str(e))
        finally:
            frappe.destroy()
