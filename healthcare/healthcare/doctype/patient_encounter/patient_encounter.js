// Copyright (c) 2016, ESS LLP and contributors
// For license information, please see license.txt

frappe.ui.form.on("Patient Encounter", {
	onload: function (frm) {
		if (
			!frm.doc.__islocal &&
			frm.doc.docstatus === 1 &&
			frm.doc.inpatient_status == "Admission Scheduled"
		) {
			frappe.db
				.get_value("Inpatient Record", frm.doc.inpatient_record, [
					"admission_encounter",
					"status",
				])
				.then(r => {
					if (r.message) {
						if (
							r.message.admission_encounter == frm.doc.name &&
							r.message.status == "Admission Scheduled"
						) {
					frm.add_custom_button(__("Cancel Admission"), function () {
						cancel_ip_order(frm);
					});
				}
						if (r.message.status == "Admitted") {
							frm.add_custom_button(
								__("Schedule Discharge"),
								function () {
						schedule_discharge(frm);
								},
							);
						}
				}
			});
		}
		show_clinical_notes(frm);
		show_orders(frm);
	},

	onload_post_render: function (frm) {
		frm.get_field("therapies").grid.editable_fields = [
			{ fieldname: "therapy_type", columns: 6 },
			{ fieldname: "no_of_sessions", columns: 2 },
			{ fieldname: "interval", columns: 2 },
		];
		frm.get_field("drug_prescription").grid.editable_fields = [
			{ fieldname: "drug_code", columns: 2 },
			{ fieldname: "drug_name", columns: 2 },
			{ fieldname: "dosage", columns: 2 },
			{ fieldname: "period", columns: 2 },
			{ fieldname: "dosage_form", columns: 2 },
		];
		if (
			frappe.meta.get_docfield("Drug Prescription", "medication").in_list_view ===
			1
		) {
			frm.get_field("drug_prescription").grid.editable_fields.splice(0, 0, {
				fieldname: "medication",
				columns: 3,
			});
			frm.get_field("drug_prescription").grid.editable_fields.splice(2, 1); // remove item description
		}
	},

	refresh: function (frm) {
		refresh_field("drug_prescription");
		refresh_field("lab_test_prescription");

		if (!frm.doc.__islocal) {
			if (frm.doc.docstatus === 1) {
				if (
					![
						"Discharge Scheduled",
						"Admission Scheduled",
						"Admitted",
						"Treatment Counselling Created",
					].includes(frm.doc.inpatient_status)
				) {
				frm.add_custom_button(__("Schedule Admission"), function () {
					schedule_inpatient(frm);
				});
			}

				frm.add_custom_button(__("Schedule"), function () {
					frappe.ui.healthcare_appointment_dialog({
						patient: frm.doc.patient,
						practitioner: frm.doc.practitioner,
						department: frm.doc.medical_department,
						company: frm.doc.company,
						appointment_date: frappe.datetime.get_today()
					});
				});
			}

			frm.add_custom_button(
				__("Refer Patient"),
				function () {
					create_patient_referral(frm);
				},
				__("Create"),
			);

			frm.add_custom_button(
				__("Patient History"),
				function () {
					if (frm.doc.patient) {
						frappe.route_options = { patient: frm.doc.patient };
						frappe.set_route("patient_history");
					} else {
						frappe.msgprint(__("Please select Patient"));
					}
				},
				__("View"),
			);

			if (
				frm.doc.docstatus == 1 &&
				frm.doc.drug_prescription &&
				frm.doc.drug_prescription.length > 0
			) {
				frm.add_custom_button(
					__("Medication Request"),
					function () {
						create_medication_request(frm);
					},
					__("Create"),
				);
			}

			if (
				frm.doc.docstatus == 1 &&
				((frm.doc.lab_test_prescription &&
					frm.doc.lab_test_prescription.length > 0) ||
					(frm.doc.procedure_prescription &&
						frm.doc.procedure_prescription.length > 0) ||
					(frm.doc.therapies && frm.doc.therapies.length > 0))
			) {
				frm.add_custom_button(
					__("Service Request"),
					function () {
						create_service_request(frm);
					},
					__("Create"),
				);
			}

			frm.add_custom_button(
				__("Vital Signs"),
				function () {
					create_vital_signs(frm);
				},
				__("Create"),
			);

			frm.add_custom_button(
				__("Medical Record"),
				function () {
					create_medical_record(frm);
				},
				__("Create"),
			);

			frm.add_custom_button(
				__("Clinical Procedure"),
				function () {
					create_procedure(frm);
				},
				__("Create"),
			);

			frm.add_custom_button(
				__("Clinical Note"),
				function () {
					frappe.route_options = {
						patient: frm.doc.patient,
						reference_doc: "Patient Encounter",
						reference_name: frm.doc.name,
						practitioner: frm.doc.practitioner,
					};
					frappe.new_doc("Clinical Note");
				},
				__("Create"),
			);

			if (
				frm.doc.drug_prescription &&
				frm.doc.inpatient_record &&
				frm.doc.inpatient_status === "Admitted"
			) {
				frm.add_custom_button(
					__("Inpatient Medication Order"),
					function () {
						frappe.model.open_mapped_doc({
							method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.make_ip_medication_order",
							frm: frm,
						});
					},
					__("Create"),
				);
			}

			frm.add_custom_button(
				__("Nursing Tasks"),
				function () {
					create_nursing_tasks(frm);
				},
				__("Create"),
			);
		}

		frm.set_query("patient", function () {
			return {
				filters: { status: "Active" },
			};
		});

		frm.set_query("lab_test_code", "lab_test_prescription", function () {
			return {
				filters: {
					is_billable: 1,
				},
			};
		});

		frm.set_query("appointment", function () {
			return {
				filters: {
					//	Scheduled filter for demo ...
					status: ["in", ["Open", "Scheduled"]],
				},
			};
		});

		frm.set_query("code_value", "codification_table", function (doc, cdt, cdn) {
			let row = frappe.get_doc(cdt, cdn);
			if (row.code_system) {
				return {
					filters: {
						code_system: row.code_system,
					},
				};
			}
		});

		frm.set_query("medication", "drug_prescription", function () {
			return {
				filters: {
					disabled: false,
				},
			};
		});

		frm.set_df_property("patient", "read_only", frm.doc.appointment ? 1 : 0);

		if (
			frm.doc.google_meet_link &&
			frappe.datetime.now_date() <= frm.doc.encounter_date
		) {
			frm.dashboard.set_headline(
				__("Join video conference with {0}", [
					`<a target='_blank' href='${frm.doc.google_meet_link}'>Google Meet</a>`,
				]),
			);
		}

		if (
			frappe.meta.get_docfield("Drug Prescription", "medication").in_list_view ===
			1
		) {
			frm.set_query("drug_code", "drug_prescription", function (doc, cdt, cdn) {
				let row = frappe.get_doc(cdt, cdn);
				let filters = { is_stock_item: 1 };
				if (row.medication) {
					filters.medication = row.medication;
				}
				return {
					query: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.get_medications_query",
					filters: filters,
				};
			});
		}
		var table_list = [
			"drug_prescription",
			"lab_test_prescription",
			"procedure_prescription",
			"therapies",
		];
		apply_code_sm_filter_to_child(frm, "priority", table_list, "Priority");
		apply_code_sm_filter_to_child(frm, "intent", table_list, "Intent");

		frm.set_query("insurance_policy", function () {
			return {
				filters: {
					patient: frm.doc.patient,
					docstatus: 1,
				},
			};
		});
	},

	appointment: function (frm) {
		frm.events.set_appointment_fields(frm);
	},

	patient: function (frm) {
		frm.events.set_patient_info(frm);
	},

	practitioner: function (frm) {
		if (!frm.doc.practitioner) {
			frm.set_value("practitioner_name", "");
		}
	},
	set_appointment_fields: function (frm) {
		if (frm.doc.appointment) {
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Patient Appointment",
					name: frm.doc.appointment,
				},
				callback: function (data) {
					let values = {
						patient: data.message.patient,
						type: data.message.appointment_type,
						practitioner: data.message.practitioner,
						invoiced: data.message.invoiced,
						company: data.message.company,
						appointment_type: data.message.appointment_type,
						insurance_policy: data.message.insurance_policy,
						insurance_coverage: data.message.insurance_coverage,
					};
					frm.set_value(values);
					frm.set_df_property("patient", "read_only", 1);
				},
			});
		} else {
			let values = {
				patient: "",
				patient_name: "",
				type: "",
				practitioner: "",
				invoiced: 0,
				patient_sex: "",
				patient_age: "",
				inpatient_record: "",
				inpatient_status: "",
				insurance_policy: "",
				insurance_coverage: "",
			};
			frm.set_value(values);
			frm.set_df_property("patient", "read_only", 0);
		}
	},

	set_patient_info: async function (frm) {
		if (frm.doc.patient) {
			frappe.call({
				method: "healthcare.healthcare.doctype.patient.patient.get_patient_detail",
				args: {
					patient: frm.doc.patient,
				},
				callback: function (data) {
					let age = "";
					if (data.message.dob) {
						age = calculate_age(data.message.dob);
					}
					let values = {
						patient_age: age,
						patient_name: data.message.patient_name,
						patient_sex: data.message.sex,
						inpatient_record: data.message.inpatient_record,
						inpatient_status: data.message.inpatient_status,
					};

					frappe.run_serially([
						() => frm.set_value(values),
						() => show_clinical_notes(frm),
						() => show_orders(frm),
					]);
				},
			});
		} else {
			let values = {
				patient_age: "",
				patient_name: "",
				patient_sex: "",
				inpatient_record: "",
				inpatient_status: "",
			};
			frm.set_value(values);
		}
	},

	get_applicable_treatment_plans: function (frm) {
		frappe.call({
			method: "get_applicable_treatment_plans",
			doc: frm.doc,
			args: { encounter: frm.doc },
			freeze: true,
			freeze_message: __("Fetching Treatment Plans"),
			callback: function () {
				new frappe.ui.form.MultiSelectDialog({
					doctype: "Treatment Plan Template",
					target: this.cur_frm,
					setters: {
						medical_department: "",
					},
					action(selections) {
						frappe
							.call({
								method: "set_treatment_plans",
								doc: frm.doc,
								args: selections,
							})
							.then(() => {
								frm.refresh_fields();
								frm.dirty();
							});
						cur_dialog.hide();
					},
				});
			},
		});
	},
});

var schedule_inpatient = function (frm) {
	let service_unit_type = "";
	var dialog = new frappe.ui.Dialog({
		title: "Patient Admission",
		fields: [
			{
				fieldtype: "Link",
				label: "Medical Department",
				fieldname: "medical_department",
				options: "Medical Department",
				reqd: 1,
			},
			{
				fieldtype: "Link",
				label: "Healthcare Practitioner (Primary)",
				fieldname: "primary_practitioner",
				options: "Healthcare Practitioner",
				reqd: 1,
			},
			{
				fieldtype: "Link",
				label: "Healthcare Practitioner (Secondary)",
				fieldname: "secondary_practitioner",
				options: "Healthcare Practitioner",
			},
			{
				fieldtype: "Link",
				label: "Nursing Checklist Template",
				fieldname: "admission_nursing_checklist_template",
				options: "Nursing Checklist Template",
			},
			{ fieldtype: "Column Break" },
			{
				fieldtype: "Date",
				label: "Admission Ordered For",
				fieldname: "admission_ordered_for",
				default: "Today",
			},
			{
				fieldtype: "Link",
				label: "Service Unit Type",
				fieldname: "service_unit_type",
				options: "Healthcare Service Unit Type",
			},
			{
				fieldtype: "Int",
				label: "Expected Length of Stay",
				fieldname: "expected_length_of_stay",
			},
			{
				fieldtype: "Link",
				label: "Treatment Plan Template",
				fieldname: "treatment_plan_template",
				options: "Treatment Plan Template",
			},
			{ fieldtype: "Section Break" },
			{
				fieldtype: "Long Text",
				label: "Admission Instructions",
				fieldname: "admission_instruction",
			},
		],
		primary_action_label: __("Order Admission"),
		primary_action: function () {
			var args = {
				patient: frm.doc.patient,
				admission_encounter: frm.doc.name,
				referring_practitioner: frm.doc.practitioner,
				company: frm.doc.company,
				medical_department: dialog.get_value("medical_department"),
				primary_practitioner: dialog.get_value("primary_practitioner"),
				secondary_practitioner: dialog.get_value("secondary_practitioner"),
				admission_ordered_for: dialog.get_value("admission_ordered_for"),
				admission_service_unit_type: dialog.get_value("service_unit_type"),
				treatment_plan_template: dialog.get_value("treatment_plan_template"),
				expected_length_of_stay: dialog.get_value("expected_length_of_stay"),
				admission_instruction: dialog.get_value("admission_instruction"),
				admission_nursing_checklist_template: dialog.get_value(
					"admission_nursing_checklist_template",
				),
			};
			frappe.call({
				method: "healthcare.healthcare.doctype.inpatient_record.inpatient_record.schedule_inpatient",
				args: {
					admission_order: args,
				},
				callback: function (data) {
					if (!data.exc) {
						frm.reload_doc();
					}
				},
				freeze: true,
				freeze_message: __("Scheduling Patient Admission"),
			});
			frm.refresh_fields();
			dialog.hide();
		},
	});

	dialog.set_values({
		medical_department: frm.doc.medical_department,
		primary_practitioner: frm.doc.practitioner,
	});

	dialog.fields_dict["service_unit_type"].get_query = function () {
		return {
			filters: {
				inpatient_occupancy: 1,
				allow_appointments: 0,
			},
		};
	};

	dialog.fields_dict["service_unit_type"].df.onchange = () => {
		if (
			dialog.get_value("service_unit_type") &&
			dialog.get_value("service_unit_type") != service_unit_type
		) {
			service_unit_type = dialog.get_value("service_unit_type");
			frappe.db
				.get_value(
					"Healthcare Service Unit Type",
					{ name: dialog.get_value("service_unit_type") },
					["is_billable", "item"],
				)
				.then(r => {
					if (r.message.is_billable && !r.message.item) {
						frappe.msgprint({
							message: __(
								"Selected service unit type doesn't have any item linked",
							),
							title: __("Warning"),
							indicator: "orange",
						});
					}
				});
		}
	};

	dialog.show();
	dialog.$wrapper.find(".modal-dialog").css("width", "800px");
};

var schedule_discharge = function (frm) {
	var dialog = new frappe.ui.Dialog({
		title: "Inpatient Discharge",
		fields: [
			{
				fieldtype: "Date",
				label: "Discharge Ordered Date",
				fieldname: "discharge_ordered_date",
				default: "Today",
				read_only: 1,
			},
			{ fieldtype: "Date", label: "Followup Date", fieldname: "followup_date" },
			{
				fieldtype: "Link",
				label: "Nursing Checklist Template",
				options: "Nursing Checklist Template",
				fieldname: "discharge_nursing_checklist_template",
			},
			{ fieldtype: "Column Break" },
			{
				fieldtype: "Small Text",
				label: "Discharge Instructions",
				fieldname: "discharge_instructions",
			},
			{ fieldtype: "Section Break", label: "Discharge Summary" },
			{
				fieldtype: "Long Text",
				label: "Discharge Note",
				fieldname: "discharge_note",
			},
		],
		primary_action_label: __("Order Discharge"),
		primary_action: function () {
			var discharge_order = {
				patient: frm.doc.patient,
				discharge_encounter: frm.doc.name,
				discharge_practitioner: frm.doc.practitioner,
				discharge_ordered_date: dialog.get_value("discharge_ordered_date"),
				followup_date: dialog.get_value("followup_date"),
				discharge_instructions: dialog.get_value("discharge_instructions"),
				discharge_note: dialog.get_value("discharge_note"),
				discharge_nursing_checklist_template: dialog.get_value(
					"discharge_nursing_checklist_template",
				),
			};
			frappe.call({
				method: "healthcare.healthcare.doctype.inpatient_record.inpatient_record.schedule_discharge",
				args: { discharge_order: discharge_order },
				callback: function (data) {
					if (!data.exc) {
						frm.reload_doc();
					}
				},
				freeze: true,
				freeze_message: "Scheduling Inpatient Discharge",
			});
			frm.refresh_fields();
			dialog.hide();
		},
	});

	dialog.show();
	dialog.$wrapper.find(".modal-dialog").css("width", "800px");
};

let create_medical_record = function (frm) {
	if (!frm.doc.patient) {
		frappe.throw(__("Please select patient"));
	}
	frappe.route_options = {
		patient: frm.doc.patient,
		status: "Open",
		reference_doctype: "Patient Medical Record",
		reference_owner: frm.doc.owner,
	};
	frappe.new_doc("Patient Medical Record");
};

let create_vital_signs = function (frm) {
	if (!frm.doc.patient) {
		frappe.throw(__("Please select patient"));
	}
	frappe.route_options = {
		patient: frm.doc.patient,
		encounter: frm.doc.name,
		company: frm.doc.company,
	};
	frappe.new_doc("Vital Signs");
};

let create_procedure = function (frm) {
	if (!frm.doc.patient) {
		frappe.throw(__("Please select patient"));
	}
	frappe.route_options = {
		patient: frm.doc.patient,
		medical_department: frm.doc.medical_department,
		company: frm.doc.company,
	};
	frappe.new_doc("Clinical Procedure");
};

let create_nursing_tasks = function (frm) {
	const d = new frappe.ui.Dialog({
		title: __("Create Nursing Tasks"),

		fields: [
			{
				label: __("Nursing Checklist Template"),
				fieldtype: "Link",
				options: "Nursing Checklist Template",
				fieldname: "template",
				reqd: 1,
			},
			{
				label: __("Start Time"),
				fieldtype: "Datetime",
				fieldname: "start_time",
				default: frappe.datetime.now_datetime(),
				reqd: 1,
			},
		],

		primary_action_label: __("Create Nursing Tasks"),

		primary_action: () => {
			let values = d.get_values();
			frappe.call({
				method: "healthcare.healthcare.doctype.nursing_task.nursing_task.create_nursing_tasks_from_template",
				args: {
					template: values.template,
					doc: frm.doc,
					start_time: values.start_time,
				},
				callback: r => {
					if (r && !r.exc) {
						frappe.show_alert({
							message: __("Nursing Tasks Created"),
							indicator: "success",
						});
					}
				},
			});

			d.hide();
			frm.set_query("lab_test_code", "lab_test_prescription", function () {
				return {
					filters: {
						is_billable: 1,
					},
				};
			});
		},
	});

	d.show();
};

let calculate_age = function (birth) {
	let ageMS = Date.parse(Date()) - Date.parse(birth);
	let age = new Date();
	age.setTime(ageMS);
	let years = age.getFullYear() - 1970;
	return `${years} ${__("Years(s)")} ${age.getMonth()} ${__(
		"Month(s)",
	)} ${age.getDate()} ${__("Day(s)")}`;
};

let cancel_ip_order = function (frm) {
	frappe.prompt(
		[
			{
				fieldname: "reason_for_cancellation",
				label: __("Reason for Cancellation"),
				fieldtype: "Small Text",
				reqd: 1,
			},
		],
		function (data) {
			frappe.call({
				method: "healthcare.healthcare.doctype.inpatient_record.inpatient_record.set_ip_order_cancelled",
				async: false,
				freeze: true,
				args: {
					inpatient_record: frm.doc.inpatient_record,
					reason: data.reason_for_cancellation,
					encounter: frm.doc.name,
				},
				callback: function (r) {
					if (!r.exc) {
						frm.reload_doc();
					}
				},
			});
		},
		__("Reason for Cancellation"),
		__("Submit"),
	);
};

let create_service_request = function (frm) {
	frappe.call({
		method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.create_service_request",
		freeze: true,
		args: {
			encounter: frm.doc.name,
		},
		callback: function (r) {
			if (r && !r.exc) {
				frm.reload_doc();
				frappe.show_alert({
					message: __("Service Request(s) Created"),
					indicator: "success",
				});
			}
		},
	});
};

let create_medication_request = function (frm) {
	frappe.call({
		method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.create_medication_request",
		freeze: true,
		args: {
			encounter: frm.doc.name,
		},
		callback: function (r) {
			if (r && !r.exc) {
				frm.reload_doc();
				frappe.show_alert({
					message: __("Medication Request(s) Created"),
					indicator: "success",
				});
			}
		},
	});
};

frappe.ui.form.on("Drug Prescription", {
	dosage: function (frm, cdt, cdn) {
		frappe.model.set_value(cdt, cdn, "update_schedule", 1);
		let child = locals[cdt][cdn];
		if (child.dosage) {
			frappe.model.set_value(cdt, cdn, "interval_uom", "Day");
			frappe.model.set_value(cdt, cdn, "interval", 1);
		}
	},

	period: function (frm, cdt, cdn) {
		frappe.model.set_value(cdt, cdn, "update_schedule", 1);
	},

	interval_uom: function (frm, cdt, cdn) {
		frappe.model.set_value(cdt, cdn, "update_schedule", 1);
		let child = locals[cdt][cdn];
		if (child.interval_uom == "Hour") {
			frappe.model.set_value(cdt, cdn, "dosage", null);
		}
	},

	medication: function (frm, cdt, cdn) {
		// to set drug_code(item) if Medication Item table have only one item
		let child = locals[cdt][cdn];
		if (!child.medication) {
			return;
		}

		frappe.call({
			method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.get_medications",
			freeze: true,
			args: {
				medication: child.medication,
			},
			callback: function (r) {
				if (r && !r.exc && r.message) {
					let data = r.message;
					if (data.length == 1) {
						if (data[0].item) {
							frappe.model.set_value(cdt, cdn, "drug_code", data[0].item);
						}
					} else {
						frappe.model.set_value(cdt, cdn, "drug_code", "");
					}
				}
			},
		});
	},
});

var apply_code_sm_filter_to_child = function (frm, field, table_list, code_system) {
	table_list.forEach(function (table) {
		frm.set_query(field, table, function () {
			return {
				filters: {
					code_system: code_system,
				},
			};
		});
	});
};

var show_clinical_notes = async function (frm) {
	if (frm.doc.docstatus == 0 && frm.doc.patient) {
		const clinical_notes = new healthcare.ClinicalNotes({
			frm: frm,
			notes_wrapper: $(frm.fields_dict.clinical_notes.wrapper),
		});
		clinical_notes.refresh();
	}
};

var show_orders = async function (frm) {
	if (frm.doc.docstatus == 0 && frm.doc.patient) {
		const orders = new healthcare.Orders({
			frm: frm,
			open_activities_wrapper: $(frm.fields_dict.order_history_html.wrapper),
			form_wrapper: $(frm.wrapper),
			create_orders: true,
		});
		orders.refresh();
	}
};

let create_patient_referral = function (frm) {
	var dialog = new frappe.ui.Dialog({
		title: "Patient Referral",
		size: "large",
		fields: [
			{
				label: "References",
				fieldname: "references",
				fieldtype: "Table",
				is_editable_grid: true,
				data: [],
				fields: [
					{
						fieldname: "refer_to",
						fieldtype: "Link",
						label: "Refer To",
						options: "Healthcare Practitioner",
						in_list_view: 1,
						reqd: 1,
						get_query: function () {
							return {
								filters: {
									name: ["!=", frm.doc.practitioner],
								},
							};
						},
					},
					{
						fieldname: "appointment_type",
						fieldtype: "Link",
						label: "Appointment Type",
						options: "Appointment Type",
						in_list_view: 1,
						reqd: 1,
					},
					{
						fieldname: "referral_note",
						fieldtype: "Long Text",
						label: "Referral Note",
						in_list_view: 1,
					},
				],
			},
		],
		primary_action_label: __("Refer"),
		primary_action: function () {
			if (dialog.get_value("references").length > 0) {
				frappe.call({
					method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.create_patient_referral",
					freeze: true,
					args: {
						encounter: frm.doc.name,
						references: dialog.get_value("references"),
					},
					callback: function (r) {
						if (r && !r.exc) {
							dialog.hide();
							frm.reload_doc();
							frappe.show_alert({
								message: __(
									"Patient referral requests created successfully",
								),
								indicator: "success",
							});
						}
					},
				});
				frm.refresh_fields();
			}
		},
	});

	dialog.show();
};

async function get_medical_codes(dn, dt = "Diagnosis") {
	const { message } = await frappe.call({
		method: "healthcare.healthcare.utils.get_medical_codes",
		args: {
			template_dt: dt,
			template_dn: dn,
		},
	});

	return message || [];
}

async function add_codes(frm, cdt, cdn) {
	row = frappe.get_doc(cdt, cdn);
	const codes = await get_medical_codes(row.diagnosis);

	codes.forEach(code => {
		if (!frm.doc.codification_table.some(c => c["code"] === code.code)) {
			let c = frm.add_child("codification_table");
			c.code_value = code.code_value;
			c.code_system = code.code_system;
			c.code = code.code;
			c.display = code.display;
			c.description = code.description;
			c.system = code.system;
		}
	});

	frm.refresh_field("codification_table");
}

async function remove_codes(frm, cdt, cdn) {
	row = frappe.get_doc(cdt, cdn);
	const codes = await get_medical_codes(row.diagnosis);

	codes.forEach(code => {
		let c = frm.doc.codification_table.find(c => c["code"] === code.code);
		if (c) {
			frappe.model.clear_doc(c.doctype, c.name);
		}
	});

	frm.refresh_field("codification_table");
}

frappe.ui.form.on("Patient Encounter Diagnosis", {
	diagnosis_add: function (frm, cdt, cdn) {
		add_codes(frm, cdt, cdn);
	},

	before_diagnosis_remove: function (frm, cdt, cdn) {
		remove_codes(frm, cdt, cdn);
	},
});

frappe.ui.healthcare_appointment_dialog = function (opts) {
	let frm = opts.frm;
	let selected_slot = null;
	let service_unit = null;
	let duration = null;
	let add_video_conferencing = null;
	let overlap_appointments = null;
	let appointment_based_on_check_in = false;
	let selected_custom_dates = [];

	/* ── Slot metadata captured from the clicked slot button ──────────
	   These values are propagated to ALL generated appointments
	   (single, repeated, custom dates) so that service_unit occupancy,
	   appointment_datetime, event creation, overlap validation, and
	   queue handling work identically for every appointment.          */
	let slot_metadata = {};

	show_availability();

	function show_empty_state(practitioner, appointment_date) {
		frappe.msgprint({
			title: __("Not Available"),
			message: __("Healthcare Practitioner {0} not available on {1}", [
				practitioner.bold(),
				appointment_date.bold(),
			]),
			indicator: "red",
		});
	}

	function show_availability() {
		let selected_practitioner = "";
		let d = new frappe.ui.Dialog({
			title: __("Available slots"),
			fields: [
				{
					fieldtype: "Link",
					options: "Medical Department",
					reqd: 1,
					fieldname: "department",
					label: "Medical Department",
				},
				{ fieldtype: "Column Break" },
				{
					fieldtype: "Link",
					options: "Healthcare Practitioner",
					reqd: 1,
					fieldname: "practitioner",
					label: "Healthcare Practitioner",
				},
				{ fieldtype: "Column Break" },
				{
					fieldtype: "Date",
					reqd: 1,
					fieldname: "appointment_date",
					label: "Date",
					min_date: new Date(frappe.datetime.get_today()),
				},
				{ fieldtype: "Section Break" },
				{
					fieldtype: "Link",
					options: "Appointment Type",
					fieldname: "appointment_type",
					label: "Appointment Type",
					reqd: 1
				},
				{
					fieldtype: "Select",
					fieldname: "repeats",
					label: "Repeats",
					options: "Does not repeat\nDaily\nWeekly\nMonthly\nCustom Dates",
					default: "Does not repeat",
				},
				{ fieldtype: "Column Break" },
				{
					fieldtype: "Date",
					fieldname: "repeat_until",
					label: "Repeat Until",
					depends_on: "eval:doc.repeats && doc.repeats != 'Does not repeat'",
				},
				{ fieldtype: "Section Break" },
				{
					fieldtype: "HTML",
					fieldname: "cd_panel",
					options: `<div id="cd-queue-panel" style="display:none"></div>`,
				},
				{ fieldtype: "HTML", fieldname: "available_slots" },
			],
			primary_action_label: __("Book"),
			primary_action: async function () {
				d.hide();

				const repeats = d.get_value("repeats");

			// ── Custom Dates ────────────────────────────────────────────
				// Each date+time pair in the queue is validated independently.
				// The first appointment serves as a template; create_repeat_appointments
				// copies it for the remaining dates, applying slot_metadata so that
				// service_unit, duration, video-conferencing, and overlap rules are
				// identical to the manually clicked slot.
				if (repeats === "Custom Dates") {
					if (!selected_custom_dates || !selected_custom_dates.length) {
						frappe.msgprint(__("Please add at least one date and time."));
						d.show();
						return;
					}

					/* Validate slot_metadata is captured — the user must have
					   clicked a slot button in the main picker first.          */
					if (!slot_metadata.service_unit && service_unit) {
						slot_metadata.service_unit = service_unit;
					}
					const meta = {
						service_unit: slot_metadata.service_unit || service_unit,
						duration: slot_metadata.duration || duration,
						appointment_based_on_check_in: slot_metadata.appointment_based_on_check_in || appointment_based_on_check_in,
						add_video_conferencing: slot_metadata.add_video_conferencing != null ? slot_metadata.add_video_conferencing : add_video_conferencing,
						overlap_appointments: slot_metadata.overlap_appointments != null ? slot_metadata.overlap_appointments : overlap_appointments,
					};

					// Create first appointment as template with full metadata
					let first = selected_custom_dates[0];
					let template_res = await create_appointment(d, first.date, first.time, meta);
					if (template_res.exc) {
						frappe.msgprint(__("Failed to create the first appointment."));
						d.show();
						return;
					}
					let template_name = template_res.docs ? template_res.docs[0].name : null;
					if (!template_name) return;

					// Create remaining appointments via server-side helper
					let remaining = selected_custom_dates.slice(1);
					if (remaining.length) {
						let custom_dates = remaining.map(item => `${item.date} ${item.time}`);
						await create_repeat_appointments(template_name, "Custom Dates", null, custom_dates, meta);
					}

					frappe.show_alert({
						message: __("{0} appointment(s) booked.", [selected_custom_dates.length]),
						indicator: "green",
					});
					if (frm) frm.reload_doc();
					return;
				}

				// ── Normal / repeating modes ─────────────────────────────────
				let appointment_name = null;

				await frappe.call({
					method: "frappe.desk.form.save.savedocs",
					args: {
						doc: JSON.stringify({
							doctype: "Patient Appointment",
							patient: opts.patient,
							practitioner: d.get_value("practitioner"),
							department: d.get_value("department"),
							appointment_date: d.get_value("appointment_date"),
							appointment_time: selected_slot,
							appointment_type: d.get_value("appointment_type"),
							service_unit: service_unit,
							duration: duration,
							appointment_based_on_check_in: appointment_based_on_check_in,
							add_video_conferencing: (add_video_conferencing && !d.$wrapper.find(".opt-out-check").is(":checked") && !overlap_appointments) ? 1 : 0,
							company: opts.company,
							status: "Scheduled",
						}),
						action: "Save",
					},
					freeze: true,
					callback: function (r) {
						if (!r.exc) {
							appointment_name = r.docs[0].name;
							frappe.show_alert({ message: __("Appointment Created: {0}", [appointment_name]), indicator: "green" });
							if (frm) frm.reload_doc();
						}
					},
				});

				if (!appointment_name) return;

				const repeat_until = d.get_value("repeat_until");

				if (repeats && repeats !== "Does not repeat" && repeat_until) {
					/* ── Propagate slot_metadata to repeat appointments ──────
					   The server validates availability per date before copying
					   the template, ensuring every repeat gets the same
					   service_unit, duration, video-conferencing, overlap
					   rules, and check-in mode as the manually clicked slot. */
					await create_repeat_appointments(
						appointment_name,
						repeats,
						repeat_until,
						null,
						slot_metadata,
					);
				}
			},
		});

		d.set_values({
			department: opts.department,
			practitioner: opts.practitioner,
			appointment_date: opts.appointment_date,
		});

		let selected_department = opts.department;

		d.fields_dict["department"].df.onchange = () => {
			if (selected_department != d.get_value("department")) {
				d.set_values({
					practitioner: "",
				});
				selected_department = d.get_value("department");
			}
			if (d.get_value("department")) {
				d.fields_dict.practitioner.get_query = function () {
					return {
						filters: {
							department: selected_department,
						},
					};
				};
			}
		};

		// disable dialog action initially
		d.get_primary_btn().attr("disabled", true);

		let fd = d.fields_dict;

		d.fields_dict["appointment_date"].df.onchange = () => {
			if (d.get_value("repeats") !== "Custom Dates") show_slots(d, fd);
		};
		d.fields_dict["practitioner"].df.onchange = () => {
			if (
				d.get_value("practitioner") &&
				d.get_value("practitioner") != selected_practitioner
			) {
				selected_practitioner = d.get_value("practitioner");
				if (d.get_value("repeats") !== "Custom Dates") show_slots(d, fd);
			}
		};
		d.fields_dict["repeats"].df.onchange = () => {
			refresh_custom_date_slots(d, fd);
		};
		d.fields_dict["repeat_until"].df.onchange = () => {
			refresh_custom_date_slots(d, fd);
		};
		d.show();
	}

	function refresh_custom_date_slots(d, fd) {
		if (d.get_value("repeats") === "Custom Dates" && d.get_value("repeat_until")) {
			d.get_primary_btn().attr("disabled", true);
			let date_ranges = get_date_range(d);
			if (!date_ranges.length) {
				fd.available_slots.html(`<p class="text-muted text-center">${__("No dates between appointment date and repeat until")}</p>`);
				return;
			}

			let html = "";

			// Queue section
			if (selected_custom_dates.length) {
				html += `<div class="text-muted" style="margin-bottom: 8px;"><b>${__("Selected:")}</b></div>`;
				selected_custom_dates.forEach((item, i) => {
					let dt = frappe.datetime.str_to_user(item.date);
					let tm = moment(item.time, "HH:mm:ss").format("HH:mm");
					html += `<div class="btn btn-sm btn-success" style="margin: 2px; cursor: default;">${dt} ${tm} <a class="remove-date" data-idx="${i}" style="cursor: pointer; color: white; margin-left: 4px;">&times;</a></div>`;
				});
				html += `<hr style="margin: 8px 0;">`;
			}

			// Date buttons for unselected dates
			html += `<div class="text-muted" style="margin-bottom: 8px;"><b>${__("Select date & time:")}</b></div><div class="date-list">`;
			date_ranges.forEach(dt => {
				let selected = selected_custom_dates.some(item => item.date === dt);
				let cls = selected ? "btn-success" : "btn-default";
				html += `<button class="btn btn-sm ${cls} custom-date-btn" data-date="${dt}" style="margin: 3px; min-width: 90px;" ${selected ? "disabled" : ""}>${frappe.datetime.str_to_user(dt)}</button>`;
			});
			html += `</div>`;

			// Time slot area
			html += `<div id="custom-time-slots" class="text-center" style="margin-top: 10px;"></div>`;

			fd.available_slots.html(html);

			// Date click handler
			fd.available_slots.$wrapper.find(".custom-date-btn:not([disabled])").on("click", function() {
				let dt = $(this).attr("data-date");
				$("#custom-time-slots").html(`<div class="text-center" style="padding: 10px;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div> ${__("Loading...")}</div>`);
				frappe.call({
					method: "healthcare.healthcare.doctype.patient_appointment.patient_appointment.get_availability_data",
					args: {
						practitioner: d.get_value("practitioner"),
						date: dt,
						appointment: {
							doctype: "Patient Appointment",
							patient: opts.patient,
							appointment_type: d.get_value("appointment_type")
						},
					},
					callback: r => {
						let data = r.message;
						if (data && data.slot_details && data.slot_details.length) {
							let slot_html = "";
							data.slot_details.forEach(si => {
								slot_html += `<div style="margin: 2px 0;">`;
								si.avail_slot.forEach(slot => {
									let disabled = false;
									let slot_start_time = moment(slot.from_time, "HH:mm:ss");
									let slot_end_time = moment(slot.to_time, "HH:mm:ss");
									let interval = ((slot_end_time - slot_start_time) / 60000) | 0;
									let now = moment();
									if (
										now.format("YYYY-MM-DD") == dt &&
										slot_start_time.isBefore(now) &&
										!slot.maximum_appointments
									) {
										disabled = true;
									} else {
										si.appointments.forEach(booked => {
											let booked_moment = moment(booked.appointment_time, "HH:mm:ss");
											let booked_end_moment = booked_moment.clone().add(booked.duration || 15, "minutes");
											if (
												slot_start_time.isBefore(booked_end_moment) &&
												slot_end_time.isAfter(booked_moment)
											) {
												if (si.allow_overlap != 1) {
													disabled = true;
												}
											}
										});
									}
									let st = moment(slot.from_time, "HH:mm:ss").format("HH:mm");
									slot_html += `<button class="btn btn-sm btn-default custom-time-btn"
										data-date="${dt}"
										data-time="${slot.from_time}"
										data-service-unit="${si.service_unit || ""}"
										data-duration="${interval}"
										data-day-appointment="${slot.maximum_appointments ? 1 : 0}"
										data-tele-conf="${si.tele_conf || 0}"
										data-overlap-appointments="${si.allow_overlap || 0}"
										style="margin: 2px;"
										${disabled ? "disabled" : ""}>${st}</button>`;
								});
								slot_html += `</div>`;
							});
							fd.available_slots.$wrapper.find("#custom-time-slots").html(slot_html);
							fd.available_slots.$wrapper.find(".custom-time-btn").on("click", function() {
								let $btn = $(this);
								let date = $btn.attr("data-date");
								let time = $btn.attr("data-time");
								service_unit = $btn.attr("data-service-unit");
								duration = $btn.attr("data-duration");
								appointment_based_on_check_in = $btn.attr("data-day-appointment");
								add_video_conferencing = parseInt($btn.attr("data-tele-conf"));
								overlap_appointments = parseInt($btn.attr("data-overlap-appointments"));
								slot_metadata = {
									service_unit: service_unit,
									duration: duration,
									appointment_based_on_check_in: appointment_based_on_check_in,
									add_video_conferencing: add_video_conferencing,
									overlap_appointments: overlap_appointments,
								};
								if (!selected_custom_dates.some(item => item.date === date)) {
									selected_custom_dates.push({date, time});
								}
								refresh_custom_date_slots(d, fd);
								d.get_primary_btn().attr("disabled", false);
							});
						} else {
							fd.available_slots.$wrapper.find("#custom-time-slots").html(`<p class="text-muted">${__("No available slots for this date")}</p>`);
						}
					},
					error: () => {
						fd.available_slots.$wrapper.find("#custom-time-slots").html(`<p class="text-muted">${__("Practitioner not available on this date")}</p>`);
					},
				});
			});

			// Remove from queue handler
			fd.available_slots.$wrapper.find(".remove-date").on("click", function() {
				let idx = parseInt($(this).attr("data-idx"));
				selected_custom_dates.splice(idx, 1);
				refresh_custom_date_slots(d, fd);
			});

		} else if (d.get_value("repeats") === "Custom Dates" && !d.get_value("repeat_until")) {
			fd.available_slots.html(`<p class="text-muted text-center">${__("Set Repeat Until to enable date selection")}</p>`);
		} else {
			show_slots(d, fd);
		}
	}

	function get_date_range(d) {
		let appt_date = frappe.datetime.str_to_obj(d.get_value("appointment_date"));
		let until = frappe.datetime.str_to_obj(d.get_value("repeat_until"));
		let dates = [];
		let cur = new Date(appt_date);
		while (cur <= until) {
			dates.push(frappe.datetime.obj_to_str(cur));
			cur.setDate(cur.getDate() + 1);
		}
		return dates;
	}

	/* ────────────────────────────────────────────────────────────────
	   Reusable helper functions for appointment creation

	   validate_slot_availability(date, practitioner, time)
	     Calls get_availability_data and checks whether the requested
	     time is present in the returned available-slot list. Returns a
	     Promise that resolves to true/false.

	   create_appointment(date, time, meta, d)
	     Creates a single Patient Appointment via savedocs, using the
	     exact same metadata fields that the manually-clicked slot
	     carries (service_unit, duration, appointment_based_on_check_in,
	     add_video_conferencing).

	   create_repeat_appointments(original_name, repeats, repeat_until,
	                               custom_dates, meta)
	     Delegates to create_multiple_appointments on the server,
	     passing slot_metadata so that every copy gets identical
	     service_unit, duration, video-conferencing and overlap rules.
	     The server validates slot availability per date before saving.
	   ──────────────────────────────────────────────────────────────── */

	/**
	 * Validate that a given time slot is available for a practitioner on a date.
	 * Uses the same get_availability_data endpoint as the slot picker UI.
	 */
	function validate_slot_availability(d, date, practitioner, time) {
		return frappe.call({
			method: "healthcare.healthcare.doctype.patient_appointment.patient_appointment.get_availability_data",
			args: {
				practitioner: practitioner,
				date: date,
				appointment: {
					doctype: "Patient Appointment",
					patient: opts.patient,
					appointment_type: d.get_value("appointment_type")
				},
			},
		}).then(r => {
			let data = r.message;
			if (!data || !data.slot_details) return false;
			for (let si of data.slot_details) {
				for (let slot of si.avail_slot) {
					if (slot.from_time === time) return true;
				}
			}
			return false;
		});
	}

	/**
	 * Create a single appointment with full slot metadata.
	 * The metadata object must contain:
	 *   service_unit, duration, appointment_based_on_check_in,
	 *   add_video_conferencing, overlap_appointments
	 *
	 * This matches exactly what the manually clicked slot button provides,
	 * ensuring service_unit occupancy, appointment_datetime, event creation,
	 * overlap validation, and queue handling all behave identically.
	 */
	function create_appointment(d, date, time, meta) {
		return frappe.call({
			method: "frappe.desk.form.save.savedocs",
			args: {
				doc: JSON.stringify({
					doctype: "Patient Appointment",
					patient: opts.patient,
					practitioner: d.get_value("practitioner"),
					department: d.get_value("department"),
					appointment_date: date,
					appointment_time: time,
					appointment_type: d.get_value("appointment_type"),
					service_unit: meta.service_unit,
					duration: meta.duration,
					appointment_based_on_check_in: meta.appointment_based_on_check_in,
					add_video_conferencing:
						(meta.add_video_conferencing &&
							!d.$wrapper.find(".opt-out-check").is(":checked") &&
							!meta.overlap_appointments)
							? 1
							: 0,
					company: opts.company,
					status: "Scheduled",
				}),
				action: "Save",
			},
			freeze: true,
		});
	}

	/**
	 * Create remaining repeat / custom-date appointments on the server.
	 * The server copies the original appointment for each generated date,
	 * validates slot availability, and applies the slot_metadata overrides
	 * so that every copy has the same service_unit, duration, etc.
	 */
	function create_repeat_appointments(original_name, repeats, repeat_until, custom_dates, meta) {
		return frappe.call({
			method: "healthcare.healthcare.doctype.patient_appointment.patient_appointment.create_multiple_appointments",
			args: {
				original_appointment_name: original_name,
				repeats: repeats,
				repeat_until: repeat_until,
				custom_dates: custom_dates,
				slot_metadata: meta,
			},
			freeze: true,
		});
	}

	function show_slots(d, fd) {
		if (d.get_value("appointment_date") && d.get_value("practitioner")) {
			fd.available_slots.html(`
				<div class="text-center" style="padding: 20px;">
					<div class="spinner-border text-primary" role="status">
						<span class="sr-only">${__("Loading...")}</span>
					</div>
					<div class="mt-2 text-muted">${__("Fetching Available Slots...")}</div>
				</div>
			`);

			frappe.call({
				method: "healthcare.healthcare.doctype.patient_appointment.patient_appointment.get_availability_data",
				args: {
					practitioner: d.get_value("practitioner"),
					date: d.get_value("appointment_date"),
					appointment: {
						doctype: "Patient Appointment",
						patient: opts.patient,
						appointment_type: d.get_value("appointment_type")
					},
				},
				callback: r => {
					let data = r.message;
					if (data.slot_details.length > 0) {
						let $wrapper = d.fields_dict.available_slots.$wrapper;

						let slot_html = get_slots(
							data.slot_details,
							data.fee_validity,
							d.get_value("appointment_date"),
						);

						$wrapper
							.css("margin-bottom", 0)
							.addClass("text-center")
							.html(slot_html);

						$wrapper.on("click", "button", function () {
							let $btn = $(this);
							$wrapper.find("button").removeClass("btn-primary").addClass("btn-secondary");
							$btn.removeClass("btn-secondary").addClass("btn-primary");
							
							/* ── Capture ALL slot metadata from the clicked button ──
							   These attributes define service_unit occupancy, duration,
							   video conferencing, overlap behaviour, and check-in mode.
							   The same metadata is propagated to every generated
							   appointment (single, repeated, custom dates).          */
							selected_slot = $btn.attr("data-name");
							service_unit = $btn.attr("data-service-unit");
							appointment_based_on_check_in =
								$btn.attr("data-day-appointment");
							duration = $btn.attr("data-duration");
							add_video_conferencing = parseInt(
								$btn.attr("data-tele-conf"),
							);
							overlap_appointments = parseInt(
								$btn.attr("data-overlap-appointments"),
							);

							slot_metadata = {
								service_unit: service_unit,
								duration: duration,
								appointment_based_on_check_in: appointment_based_on_check_in,
								add_video_conferencing: add_video_conferencing,
								overlap_appointments: overlap_appointments,
							};
							
							d.get_primary_btn().attr("disabled", null);
							if (d.get_value("repeats") === "Custom Dates") {
								refresh_custom_date_slots(d, fd);
							}
						});
					} else {
						show_empty_state(
							d.get_value("practitioner"),
							d.get_value("appointment_date"),
						);
					}
				},
				error: () => {
					fd.available_slots.html("");
				},
			});
		}
	}

	function get_slots(slot_details, fee_validity, appointment_date) {
		let slot_html = "";

		slot_details.forEach(slot_info => {
			slot_html += `<div class="slot-info" style="margin-bottom: 8px; padding-bottom: 8px;">`;
			
			if (slot_info.slot_name == "Practitioner Availability") {
				slot_html += `<span class="text-muted" style="font-size: 13px;"><b>${__("Practitioner Availability:")}</b> ${slot_info.display || slot_info.slot_name}</span><br>`;
			} else {
				slot_html += `<span class="text-muted" style="font-size: 13px;"><b>${__("Practitioner Schedule:")}</b> ${slot_info.slot_name}</span><br>`;
			}
			
			if (slot_info.service_unit) {
				slot_html += `<span class="text-muted" style="font-size: 13px;"><b>${__("Service Unit:")}</b> ${slot_info.service_unit}</span><br>`;
			}

			slot_html += "</div><div class='slot-container' style='display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 8px;'>";

			slot_html += slot_info.avail_slot
				.map(slot => {
					let disabled = false;
					let start_str = slot.from_time;
					let slot_start_time = moment(slot.from_time, "HH:mm:ss");
					let slot_end_time = moment(slot.to_time, "HH:mm:ss");
					let interval = ((slot_end_time - slot_start_time) / 60000) | 0;

					// Check for overlaps correctly
					let now = moment();
					if (
						now.format("YYYY-MM-DD") == appointment_date &&
						slot_start_time.isBefore(now) &&
						!slot.maximum_appointments
					) {
						disabled = true;
					} else {
						slot_info.appointments.forEach(booked => {
							let booked_moment = moment(booked.appointment_time, "HH:mm:ss");
							let booked_end_moment = booked_moment.clone().add(booked.duration || 15, "minutes");
							
							if (
								slot_start_time.isBefore(booked_end_moment) && 
								slot_end_time.isAfter(booked_moment)
							) {
								if (slot_info.allow_overlap != 1) {
									disabled = true;
								}
							}
						});
					}

					// Time format
					let display_time = moment(start_str, "HH:mm:ss").format("HH:mm"); 

					return `
						<button class="btn btn-default"
							style="min-width: 60px; font-size: 12px; border-radius: 4px; border: 1px solid #ddd;"
							data-name="${start_str}"
							data-duration="${interval}"
							data-day-appointment="${slot.maximum_appointments ? 1 : 0}"
							data-tele-conf="${slot_info.tele_conf || 0}"
							data-overlap-appointments="${slot_info.allow_overlap || 0}"
							data-service-unit="${slot_info.service_unit || ""}"
							${disabled ? "disabled" : ""}>
							${display_time}
						</button>`;
				})
				.join("");
				
			slot_html += "</div><br>";
		});

		return slot_html;
	}
};

