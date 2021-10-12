// Copyright (c) 2021, ALYF GmbH and contributors
// For license information, please see license.txt

frappe.provide("frappe.ui");
frappe.provide("frappe.web_form");
import EventEmitterMixin from '../../../../../../frappe/frappe/public/js/frappe/event_emitter';

export default class WebForm extends frappe.ui.FieldGroup {
	constructor(opts) {
		super();
		Object.assign(this, opts);
		frappe.web_form = this;
		frappe.web_form.events = {};
		Object.assign(frappe.web_form.events, EventEmitterMixin);
		this.current_section = 0;
		window.cur_web_form = this;
	}

	prepare(web_form_doc, doc) {
		Object.assign(this, web_form_doc);
		this.fields = web_form_doc.web_form_fields;
		this.doc = doc;
	}

	make() {
		super.make();
		this.set_field_values();
		if (this.introduction_text) this.set_form_description(this.introduction_text);
		if (this.allow_print && !this.is_new) this.setup_print_button();
		if (this.allow_delete && !this.is_new) this.setup_delete_button();
		if (this.is_new) this.setup_cancel_button();
		this.setup_primary_action();
		this.setup_previous_next_button();
		this.toggle_step();
		$(".link-btn").remove();

		// webform client script
		frappe.init_client_script && frappe.init_client_script();
		frappe.web_form.events.trigger('after_load');
		this.after_load && this.after_load();
	}

	on(fieldname, handler) {
		let field = this.fields_dict[fieldname];
		field.df.change = () => {
			handler(field, field.value);
		};
	}

	set_field_values() {
		if (this.doc.name) this.set_values(this.doc);
		else return;
	}

	set_default_values() {
		let values = frappe.utils.get_query_params();
		delete values.new;
		this.set_values(values);
	}

	set_form_description(intro) {
		let intro_wrapper = document.getElementById('introduction');
		intro_wrapper.innerHTML = intro;
	}

	add_button(name, type, action, wrapper_class=".web-form-actions") {
		const button = document.createElement("button");
		button.classList.add("btn", "btn-" + type, "btn-sm", "ml-2");
		button.innerHTML = name;
		button.onclick = action;
		document.querySelector(wrapper_class).appendChild(button);
	}

	add_button_to_footer(name, type, action) {
		this.add_button(name, type, action, '.web-form-footer');
	}

	add_button_to_header(name, type, action) {
		this.add_button(name, type, action, '.web-form-actions');
	}

	setup_primary_action() {
		this.add_button_to_header(this.button_label || "Save", "primary", () =>
			this.save()
		);

		this.add_button_to_footer(this.button_label || "Save", "primary", () =>
			this.save()
		);
	}

	setup_cancel_button() {
		this.add_button_to_header(__("Cancel"), "light", () => this.cancel());
	}

	setup_delete_button() {
		frappe.has_permission(this.doc_type, "", "delete", () => {
			this.add_button_to_header(
				frappe.utils.icon('delete'),
				"danger",
				() => this.delete()
			);
		});
	}

	setup_print_button() {
		this.add_button_to_header(
			frappe.utils.icon('print'),
			"light",
			() => this.print()
		);
	}

	setup_previous_next_button() {
		let me = this;

		if (!me.is_multi_step_form) {
			return;
		}

		$('.web-form-footer').after(`
			<div id="form-step-footer" class="pull-right">
				<button id="previous-button" class="btn btn-primary btn-sm ml-2">${__("Previous")}</button>
				<button id="next-button" class="btn btn-primary btn-sm ml-2">${__("Next")}</button>
			</div>
		`);

		$('#previous-button').on('click', function () {
			let is_validated = me.validate_section();

			if (!is_validated) return;
			me.current_section = me.current_section > 0 ? me.current_section - 1 : me.current_section;
			me.toggle_step();
		});

		$('#next-button').on('click', function () {
			let is_validated = me.validate_section();

			if (!is_validated) return;
			me.current_section += 1;
			me.toggle_step();
		});
	}

	validate_section() {
		if (this.allow_incomplete) return true;

		let fields = $(`.form-section:eq(${this.current_section}) .form-control`);
		let errors = []

		for (let field of fields) {
			let fieldname = $(field).attr("data-fieldname");
			if (!fieldname) continue;

			field = this.fields_dict[fieldname];
			console.log(field)
			if (field.get_value) {
				let value = field.get_value();
				if (field.df.reqd && is_null(typeof value === 'string' ? strip_html(value) : value)) errors.push(__(field.df.label));

				if (field.df.reqd && field.df.fieldtype === 'Text Editor' && is_null(strip_html(cstr(value)))) errors.push(__(field.df.label));

				// if (!is_null(value)) ret[field.df.fieldname] = value;
			}
		}

		if (errors.length) {
			frappe.msgprint({
				title: __('Missing Values Required'),
				message: __('Following fields have missing values:') +
					'<br><br><ul><li>' + errors.join('<li>') + '</ul>',
				indicator: 'orange'
			});
			return false;
		}

		return true;
	}

	toggle_step() {
		if (!this.is_multi_step_form) return;

		let sections = $('div.form-section').length

		if (this.current_section == 0) {
			$('#previous-button').hide();
		} else {
			$('#previous-button').show();
		}

		if (this.current_section < sections - 1) {
			$('#next-button').show();
			$('.web-form-footer').hide();
		} else {
			$('#next-button').hide();
			$('.web-form-footer').show();
		}

		this.hide_sections(sections);
		this.show_section();
	}

	show_section() {
		$(`.form-section:eq(${this.current_section})`).show();
	}

	hide_sections(sections) {
		for (let idx = 0; idx < sections; idx++) {
			if (idx !== this.current_section) {
				$(`.form-section:eq(${idx})`).hide();
			}
		}
	}

	save() {
		let is_new = this.is_new;
		if (this.validate && !this.validate()) {
			frappe.throw(__("Couldn't save, please check the data you have entered"), __("Validation Error"));
		}

		// validation hack: get_values will check for missing data
		let doc_values = super.get_values(this.allow_incomplete);

		if (!doc_values) return;

		if (window.saving) return;
		let for_payment = Boolean(this.accept_payment && !this.doc.paid);

		Object.assign(this.doc, doc_values);
		this.doc.doctype = this.doc_type;
		this.doc.web_form_name = this.name;

		// Save
		window.saving = true;
		frappe.form_dirty = false;

		frappe.call({
			type: "POST",
			method: "frappe.website.doctype.web_form.web_form.accept",
			args: {
				data: this.doc,
				web_form: this.name,
				docname: this.doc.name,
				for_payment
			},
			callback: response => {
				// Check for any exception in response
				if (!response.exc) {
					// Success
					this.handle_success(response.message);
					frappe.web_form.events.trigger('after_save');
					this.after_save && this.after_save();
					// args doctype and docname added to link doctype in file manager
					if (is_new) {
						frappe.call({
							type: 'POST',
							method: "frappe.handler.upload_file",
							args: {
								file_url: response.message.attachment,
								doctype: response.message.doctype,
								docname: response.message.name
							}
						});
					}
				}
			},
			always: function() {
				window.saving = false;
			}
		});
		return true;
	}

	delete() {
		frappe.call({
			type: "POST",
			method: "frappe.website.doctype.web_form.web_form.delete",
			args: {
				web_form_name: this.name,
				docname: this.doc.name
			}
		});
	}

	print() {
		window.open(`/printview?
			doctype=${this.doc_type}
			&name=${this.doc.name}
			&format=${this.print_format || "Standard"}`, '_blank');
	}

	cancel() {
		window.location.href = window.location.pathname;
	}

	handle_success(data) {
		if (this.accept_payment && !this.doc.paid) {
			window.location.href = data;
		}

		const success_dialog = new frappe.ui.Dialog({
			title: __("Saved Successfully"),
			secondary_action: () => {
				if (this.success_url) {
					window.location.href = this.success_url;
				} else if(this.login_required) {
					window.location.href =
						window.location.pathname + "?name=" + data.name;
				}
			}
		});

		success_dialog.show();
		const success_message =
			this.success_message || __("Your information has been submitted");
		success_dialog.set_message(success_message);
	}
}
