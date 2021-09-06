// Copyright (c) 2021, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.provide("erpnext.assets");


erpnext.assets.AssetCapitalization = class AssetCapitalization extends erpnext.stock.StockController {
	setup() {
		this.setup_posting_date_time_check();
	}

	onload() {
		this.setup_queries();
	}

	refresh() {
		erpnext.hide_company();
	}

	setup_queries() {
		var me = this;

		me.setup_warehouse_query();

		me.frm.set_query("target_item_code", function() {
			return erpnext.queries.item();
		});

		me.frm.set_query("target_asset", function() {
			var filters = {};

			if (me.frm.doc.target_item_code) {
				filters['item_code'] = me.frm.doc.target_item_code;
			}

			filters['status'] = ["not in", ["Draft", "Scrapped", "Sold"]]
			filters['docstatus'] = 1;

			return {
				filters: filters
			}
		});

		me.frm.set_query("asset", "asset_items", function() {
			var filters = {
				'status': ["not in", ["Draft", "Scrapped", "Sold"]],
				'docstatus': 1
			}

			if (me.frm.doc.target_asset) {
				filters['name'] = ['!=', me.frm.doc.target_asset]
			}

			return {
				filters: filters
			}
		});

		me.frm.set_query("item_code", "stock_items", function() {
			return erpnext.queries.item({"is_stock_item": 1});
		});

		me.frm.set_query("item_code", "service_items", function() {
			return erpnext.queries.item({"is_stock_item": 0, "is_fixed_asset": 0});
		});

		me.frm.set_query('batch_no', 'stock_items', function(doc, cdt, cdn) {
			var item = locals[cdt][cdn];
			if(!item.item_code) {
				frappe.throw(__("Please enter Item Code to get Batch Number"));
			} else {
				var filters = {
					'item_code': item.item_code,
					'posting_date': me.frm.doc.posting_date || frappe.datetime.nowdate(),
					'warehouse': item.warehouse
				}

				return {
					query : "erpnext.controllers.queries.get_batch_no",
					filters: filters
				}
			}
		});

		me.frm.set_query('expense_account', 'service_items', function() {
			return {
				filters: {
					"account_type": ['in', ["Tax", "Expense Account", "Income Account", "Expenses Included In Valuation", "Expenses Included In Asset Valuation"]],
					"is_group": 0,
					"company": me.frm.doc.company
				}
			};
		});
	}

	target_item_code() {
		return this.get_target_item_details();
	}

	target_asset() {
		return this.get_target_asset_details();
	}

	item_code(doc, cdt, cdn) {
		var row = frappe.get_doc(cdt, cdn);
		if (cdt === "Asset Capitalization Stock Item") {
			this.get_consumed_stock_item_details(row);
		} else if (cdt == "Asset Capitalization Service Item") {
			this.get_service_item_details(row);
		}
	}

	warehouse(doc, cdt, cdn) {
		var row = frappe.get_doc(cdt, cdn);
		if (cdt === "Asset Capitalization Stock Item") {
			this.get_warehouse_details(row);
		}
	}

	asset(doc, cdt, cdn) {
		var row = frappe.get_doc(cdt, cdn);
		if (cdt === "Asset Capitalization Asset Item") {
			this.get_consumed_asset_details(row);
		}
	}

	posting_date() {
		if (this.frm.doc.posting_date) {
			this.get_all_item_warehouse_details();
		}
	}

	posting_time() {
		if (this.frm.doc.posting_time) {
			this.get_all_item_warehouse_details();
		}
	}

	finance_book() {
		this.get_all_asset_values();
	}

	stock_qty() {
		this.calculate_totals();
	}

	qty() {
		this.calculate_totals();
	}

	rate() {
		this.calculate_totals();
	}

	company() {
		var me = this;

		if (me.frm.doc.company) {
			frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype: "Company",
					filters: {"name": me.frm.doc.company},
					fieldname: "cost_center"
				},
				callback: function (r) {
					if (r.message) {
						$.each(me.frm.doc.service_items || [], function (i, d) {
							frappe.model.set_value(d.doctype, d.name, "cost_center", r.message.cost_center);
						});
					}
				}
			});
		}

		erpnext.accounts.dimensions.update_dimension(me.frm, me.frm.doctype);
	}

	serivce_items_add(doc, cdt, cdn) {
		erpnext.accounts.dimensions.copy_dimension_from_first_row(this.frm, cdt, cdn, 'service_items');
	}

	get_target_item_details() {
		var me = this;

		if (me.frm.doc.target_item_code) {
			return me.frm.call({
				method: "erpnext.assets.doctype.asset_capitalization.asset_capitalization.get_target_item_details",
				child: me.frm.doc,
				args: {
					item_code: me.frm.doc.target_item_code,
				},
				callback: function (r) {
					if (!r.exc) {
						me.frm.refresh_fields();
					}
				}
			});
		}
	}

	get_target_asset_details() {
		var me = this;

		if (me.frm.doc.target_asset) {
			return me.frm.call({
				method: "erpnext.assets.doctype.asset_capitalization.asset_capitalization.get_target_asset_details",
				child: me.frm.doc,
				args: {
					asset: me.frm.doc.target_asset
				},
				callback: function (r) {
					if (!r.exc) {
						me.frm.refresh_fields();
					}
				}
			});
		}
	}

	get_consumed_stock_item_details(row) {
		var me = this;

		if (row && row.item_code) {
			return me.frm.call({
				method: "erpnext.assets.doctype.asset_capitalization.asset_capitalization.get_consumed_stock_item_details",
				child: row,
				args: {
					args: {
						item_code: row.item_code,
						warehouse: row.warehouse,
						stock_qty: flt(row.stock_qty),
						doctype: me.frm.doc.doctype,
						name: me.frm.doc.name,
						company: me.frm.doc.company,
						posting_date: me.frm.doc.posting_date,
						posting_time: me.frm.doc.posting_time,
					}
				},
				callback: function (r) {
					if (!r.exc) {
						me.calculate_totals();
					}
				}
			});
		}
	}

	get_consumed_asset_details(row) {
		var me = this;

		if (row && row.asset) {
			return me.frm.call({
				method: "erpnext.assets.doctype.asset_capitalization.asset_capitalization.get_consumed_asset_details",
				child: row,
				args: {
					args: {
						asset: row.asset,
						doctype: me.frm.doc.doctype,
						name: me.frm.doc.name,
						company: me.frm.doc.company,
						finance_book: me.frm.doc.finance_book,
						posting_date: me.frm.doc.posting_date,
						posting_time: me.frm.doc.posting_time,
					}
				},
				callback: function (r) {
					if (!r.exc) {
						me.calculate_totals();
					}
				}
			});
		}
	}

	get_service_item_details(row) {
		var me = this;

		if (row && row.item_code) {
			return me.frm.call({
				method: "erpnext.assets.doctype.asset_capitalization.asset_capitalization.get_service_item_details",
				child: row,
				args: {
					args: {
						item_code: row.item_code,
						qty: flt(row.qty),
						expense_account: row.expense_account,
						company: me.frm.doc.company,
					}
				},
				callback: function (r) {
					if (!r.exc) {
						me.calculate_totals();
					}
				}
			});
		}
	}

	get_warehouse_details(item) {
		var me = this;
		if(item.item_code && item.warehouse) {
			me.frm.call({
				method: "erpnext.assets.doctype.asset_capitalization.asset_capitalization.get_warehouse_details",
				child: item,
				args: {
					args: {
						'item_code': item.item_code,
						'warehouse': cstr(item.warehouse),
						'qty': flt(item.stock_qty),
						'serial_no': item.serial_no,
						'posting_date': me.frm.doc.posting_date,
						'posting_time': me.frm.doc.posting_time,
						'company': me.frm.doc.company,
						'voucher_type': me.frm.doc.doctype,
						'voucher_no': me.frm.doc.name,
						'allow_zero_valuation': 1
					}
				},
				callback: function(r) {
					if (!r.exc) {
						me.calculate_totals();
					}
				}
			});
		}
	}

	get_all_item_warehouse_details() {
		var me = this;
		me.frm.call({
			method: "set_warehouse_details",
			doc: me.frm.doc,
			callback: function(r) {
				if (!r.exc) {
					me.calculate_totals();
				}
			}
		});
	}

	get_all_asset_values() {
		var me = this;
		me.frm.call({
			method: "set_asset_values",
			doc: me.frm.doc,
			callback: function(r) {
				if (!r.exc) {
					me.calculate_totals();
				}
			}
		});
	}

	calculate_totals() {
		var me = this;

		me.frm.doc.stock_items_total = 0;
		me.frm.doc.asset_items_total = 0;
		me.frm.doc.service_items_total = 0;

		$.each(me.frm.doc.stock_items || [], function (i, d) {
			d.amount = flt(flt(d.stock_qty) * flt(d.valuation_rate), precision('amount', d));
			me.frm.doc.stock_items_total += d.amount;
		});

		$.each(me.frm.doc.asset_items || [], function (i, d) {
			d.asset_value = flt(flt(d.asset_value), precision('asset_value', d));
			me.frm.doc.asset_items_total += d.asset_value;
		});

		$.each(me.frm.doc.service_items || [], function (i, d) {
			d.amount = flt(flt(d.qty) * flt(d.rate), precision('amount', d));
			me.frm.doc.service_items_total += d.amount;
		});

		me.frm.doc.stock_items_total = flt(me.frm.doc.stock_items_total, precision('stock_items_total'));
		me.frm.doc.asset_items_total = flt(me.frm.doc.asset_items_total, precision('asset_items_total'));
		me.frm.doc.service_items_total = flt(me.frm.doc.service_items_total, precision('service_items_total'));

		me.frm.doc.total_value = me.frm.doc.stock_items_total + me.frm.doc.asset_items_total + me.frm.doc.service_items_total;
		me.frm.doc.total_value = flt(me.frm.doc.total_value, precision('total_value'));

		me.frm.refresh_fields();
	}
};

//$.extend(cur_frm.cscript, new erpnext.assets.AssetCapitalization({frm: cur_frm}));
cur_frm.cscript = new erpnext.assets.AssetCapitalization({frm: cur_frm});
