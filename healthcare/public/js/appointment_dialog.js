frappe.provide("frappe.ui");

frappe.ui.healthcare_appointment_dialog = function (opts) {
	let frm = opts.frm;
	let selected_slot = null;
	let service_unit = null;
	let duration = null;
	let add_video_conferencing = null;
	let overlap_appointments = null;
	let appointment_based_on_check_in = false;

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
					fieldtype: "Select",
					fieldname: "repeats",
					label: "Repeats",
					options: "Does not repeat\nDaily\nWeekly\nMonthly",
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
				{ fieldtype: "HTML", fieldname: "available_slots" },
			],
			primary_action_label: __("Book"),
			primary_action: async function () {
				if (frm && frm.doctype === "Patient Appointment") {
					frm.set_value("appointment_time", selected_slot);
					add_video_conferencing =
						add_video_conferencing &&
						!d.$wrapper.find(".opt-out-check").is(":checked") &&
						!overlap_appointments;

					frm.set_value("add_video_conferencing", add_video_conferencing);
					if (!frm.doc.duration) {
						frm.set_value("duration", duration);
					}

					frm.set_value("practitioner", d.get_value("practitioner"));
					frm.set_value("department", d.get_value("department"));
					frm.set_value("appointment_date", d.get_value("appointment_date"));
					frm.set_value(
						"appointment_based_on_check_in",
						appointment_based_on_check_in,
					);

					if (service_unit) {
						frm.set_value("service_unit", service_unit);
					}
				}

				let repeats = d.get_value("repeats");
				let repeat_until = d.get_value("repeat_until");

				d.hide();

				let appointment_name = null;

				if (frm && frm.doctype === "Patient Appointment") {
					frm.enable_save();
					await frm.save();
					appointment_name = frm.doc.name;
				} else {
					// Create via API
					await frappe.call({
						method: "frappe.desk.form.save.savedocs",
						args: {
							doc: JSON.stringify({
								doctype: "Patient Appointment",
								patient: opts.patient || (frm ? frm.doc.patient : null),
								practitioner: d.get_value("practitioner"),
								department: d.get_value("department"),
								appointment_date: d.get_value("appointment_date"),
								appointment_time: selected_slot,
								service_unit: service_unit,
								duration: duration,
								appointment_based_on_check_in: appointment_based_on_check_in,
								add_video_conferencing: (add_video_conferencing && !d.$wrapper.find(".opt-out-check").is(":checked") && !overlap_appointments) ? 1 : 0,
								company: opts.company || (frm ? frm.doc.company : null),
								status: "Scheduled"
							}),
							action: "Save"
						},
						freeze: true,
						callback: function(r) {
							if (!r.exc) {
								appointment_name = r.docs[0].name;
								frappe.show_alert({message: __("Appointment Created: {0}", [appointment_name]), indicator: "green"});
							}
						}
					});
				}

				if (appointment_name && repeats && repeats !== "Does not repeat" && repeat_until) {
					await frappe.call({
						method: "healthcare.healthcare.doctype.patient_appointment.patient_appointment.create_multiple_appointments",
						args: {
							original_appointment_name: appointment_name,
							repeats: repeats,
							repeat_until: repeat_until
						}
					});
				}

				if (
					frm && frm.doctype === "Patient Appointment" &&
					!frm.is_new() &&
					(!frm.doc.practitioner || frm.doc.practitioner == d.get_value("practitioner"))
				) {
					await frappe.db
						.get_single_value("Healthcare Settings", "show_payment_popup")
						.then(val => {
							frappe.call({
								method: "healthcare.healthcare.doctype.fee_validity.fee_validity.check_fee_validity",
								args: { appointment: frm.doc },
								callback: r => {
									if (val && !r.message && !frm.doc.invoiced) {
										// make_payment is likely not available here, would need to handle
									} else {
										frappe.call({
											method: "healthcare.healthcare.doctype.patient_appointment.patient_appointment.update_fee_validity",
											args: { appointment: frm.doc },
											callback: r => {
												frm.reload_doc();
											},
										});
									}
								},
							});
						});
				}
				d.get_primary_btn().attr("disabled", true);
			},
		});

		d.set_values({
			department: opts.department || (frm ? frm.doc.department : null),
			practitioner: opts.practitioner || (frm ? frm.doc.practitioner : null),
			appointment_date: opts.appointment_date || (frm ? frm.doc.appointment_date : null),
		});

		let selected_department = opts.department || (frm ? frm.doc.department : null);

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
			show_slots(d, fd);
		};
		d.fields_dict["practitioner"].df.onchange = () => {
			if (
				d.get_value("practitioner") &&
				d.get_value("practitioner") != selected_practitioner
			) {
				selected_practitioner = d.get_value("practitioner");
				show_slots(d, fd);
			}
		};
		d.show();
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
					appointment: frm ? frm.doc : {
						doctype: "Patient Appointment",
						patient: opts.patient || (frm ? frm.doc.patient : null),
						appointment_type: opts.appointment_type
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
							$wrapper.find("button").removeClass("btn-outline-primary");
							$btn.addClass("btn-outline-primary");
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
							if ($btn.attr("data-tele-conf") == 1) {
								if (d.$wrapper.find(".opt-out-conf-div").length) {
									d.$wrapper.find(".opt-out-conf-div").show();
								} else {
									overlap_appointments
										? d.footer.prepend(
												`<div class="opt-out-conf-div ellipsis text-muted" style="vertical-align:text-bottom;">
												<label>
													<span class="label-area">
													${__("Video Conferencing disabled for group consultations")}
													</span>
												</label>
											</div>`,
										  )
										: d.footer.prepend(
												`<div class="opt-out-conf-div ellipsis" style="vertical-align:text-bottom;">
											<label>
												<input type="checkbox" class="opt-out-check"/>
												<span class="label-area">
												${__("Do not add Video Conferencing")}
												</span>
											</label>
										</div>`,
										  );
								}
							} else {
								d.$wrapper.find(".opt-out-conf-div").hide();
							}
							d.get_primary_btn().attr("disabled", null);
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
		} else {
			fd.available_slots.html(
				__("Appointment date and Healthcare Practitioner are Mandatory").bold(),
			);
		}
	}

	function get_slots(slot_details, fee_validity, appointment_date) {
		let slot_html = "";
		let appointment_count = 0;
		let unavailable = false;
		let disabled = false;
		let start_str, slot_start_time, slot_end_time, interval, count_class, tool_tip;

		slot_details.forEach(slot_info => {
			slot_html += `<div class="slot-info">`;
			if (fee_validity && fee_validity != "Disabled") {
				slot_html += `
					<span style="color:green">
					${__("Patient has fee validity till")} <b>${moment(fee_validity.valid_till).format(
						"DD-MM-YYYY",
					)}</b>
					</span><br>`;
			} else if (fee_validity != "Disabled") {
				slot_html += `
					<span style="color:red">
					${__("Patient has no fee validity")}
					</span><br>`;
			}

			if (slot_info.slot_name == "Practitioner Availability") {
				slot_html += `
					<span>
						<b>${__("Practitioner Availability:")}</b> ${
							slot_info.display || slot_info.slot_name
						}</b>
					</span><br>`;
				if (slot_info.service_unit) {
					slot_html += `<span><b>${__("Service Unit:")}</b> ${
						slot_info.service_unit
					}</span>`;
				}
			} else {
				slot_html += `
					<span><b>
					${__("Practitioner Schedule:")}</b> ${slot_info.slot_name}
						${
							slot_info.tele_conf && !slot_info.allow_overlap
								? "<i class='fa fa-video-camera fa-1x' aria-hidden='true'></i>"
								: ""
						}
					</span><br>
					<span><b>${__("Service Unit:")}</b> ${slot_info.service_unit}</span>`;
				if (slot_info.service_unit_capacity) {
					slot_html += `<br><span> <b> ${__("Maximum Capacity:")} </b> ${
						slot_info.service_unit_capacity
					} </span>`;
				}
			}

			slot_html += "</div><br>";

			slot_html += slot_info.avail_slot
				.map(slot => {
					appointment_count = 0;
					unavailable = false;
					disabled = false;
					count_class = tool_tip = "";
					start_str = slot.from_time;
					slot_start_time = moment(slot.from_time, "HH:mm:ss");
					slot_end_time = moment(slot.to_time, "HH:mm:ss");
					interval = ((slot_end_time - slot_start_time) / 60000) | 0;

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
							if (slot.maximum_appointments) {
								if (booked.appointment_date == appointment_date) {
									appointment_count++;
								}
							}
							if (
								booked_moment.isSame(slot_start_time) ||
								booked_moment.isBetween(slot_start_time, slot_end_time)
							) {
								if (booked.duration == 0) {
									disabled = true;
									return false;
								}
							}
						});
					}

					if (slot.maximum_appointments) {
						if (appointment_count >= slot.maximum_appointments) {
							unavailable = true;
						}
						return `
							<button class="btn btn-sm btn-default"
								style="margin: 0 10px 10px 0; width: 72px;"
								data-name="${start_str}"
								data-duration="${interval}"
								data-day-appointment="1"
								data-tele-conf="${slot_info.tele_conf || 0}"
								data-overlap-appointments="${slot_info.allow_overlap || 0}"
								data-service-unit="${slot_info.service_unit || ""}"
								${unavailable ? "disabled" : ""}>
								${appointment_count} / ${slot.maximum_appointments}
							</button>`;
					}

					return `
						<button class="btn btn-sm btn-default ${count_class}"
							style="margin: 0 10px 10px 0; width: 72px;"
							data-name="${start_str}"
							data-duration="${interval}"
							data-tele-conf="${slot_info.tele_conf || 0}"
							data-overlap-appointments="${slot_info.allow_overlap || 0}"
							data-service-unit="${slot_info.service_unit || ""}"
							title="${tool_tip}"
							${disabled ? "disabled" : ""}>
							${moment(start_str, "HH:mm:ss").format("HH:mm")}
						</button>`;
				})
				.join("");
		});

		return slot_html;
	}
};
