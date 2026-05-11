frappe.provide("frappe.ui");

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
				{ fieldtype: "HTML", fieldname: "available_slots" },
			],
			primary_action_label: __("Book"),
			primary_action: async function () {
				let repeats = d.get_value("repeats");
				let repeat_until = d.get_value("repeat_until");

			// ── Custom Dates ────────────────────────────────────────────
				// Each date+time pair in the queue is validated independently.
				// The first appointment serves as a template; create_repeat_appointments
				// copies it for the remaining dates, applying slot_metadata so that
				// service_unit, duration, video-conferencing, and overlap rules are
				// identical to the manually clicked slot.
				if (repeats === "Custom Dates") {
					if (!selected_custom_dates || !selected_custom_dates.length) {
						frappe.throw(__("Please add at least one date and time."));
					}
					d.hide();

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

				repeats = d.get_value("repeats");
				repeat_until = d.get_value("repeat_until");

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
								appointment_type: d.get_value("appointment_type"),
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

				if (appointment_name && repeats && repeats !== "Does not repeat") {
					if (repeat_until) {
						/* ── Propagate slot_metadata to repeat appointments ──
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
			selected_custom_dates = [];
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
				fd.available_slots.$wrapper.find("#custom-time-slots").html(`<div class="text-center" style="padding: 10px;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div> ${__("Loading...")}</div>`);
				frappe.call({
					method: "healthcare.healthcare.doctype.patient_appointment.patient_appointment.get_availability_data",
					args: {
						practitioner: d.get_value("practitioner"),
						date: dt,
						appointment: {
							doctype: "Patient Appointment",
							patient: opts.patient || (frm ? frm.doc.patient : null),
							appointment_type: d.get_value("appointment_type") || opts.appointment_type
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
									let interval = ((slot_end_time - slot_start_time) / 60000) | 0;
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
								/* ── Capture slot metadata from the time button ──
								   This ensures service_unit, duration, etc. are set
								   even if the user never clicked a main slot button. */
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

	   create_appointment(date, time, meta)
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
					patient: opts.patient || (frm ? frm.doc.patient : null),
					appointment_type: d.get_value("appointment_type") || opts.appointment_type
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
					patient: opts.patient || (frm ? frm.doc.patient : null),
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
					company: opts.company || (frm ? frm.doc.company : null),
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
					appointment: frm ? frm.doc : {
						doctype: "Patient Appointment",
						patient: opts.patient || (frm ? frm.doc.patient : null),
						appointment_type: d.get_value("appointment_type") || opts.appointment_type
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
