const fs = require('node:fs');
const path = require('node:path');
const { Pool, types } = require('pg');

// Preserve JSON-number behavior for BIGINT IDs and NUMERIC vital measurements.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

const TABLE_COLUMNS = Object.freeze({
  accounts: ['id', 'name', 'email', 'password', 'role', 'is_active', 'created_at'],
  patients: ['id', 'name', 'section', 'age', 'gender', 'status', 'status_color', 'observation_started_at', 'date_of_birth', 'grade_level', 'allergies', 'chronic_conditions', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship', 'parent_email', 'adviser_name', 'adviser_email', 'graduation_year', 'created_at'],
  vitals: ['id', 'patient_id', 'temperature', 'heart_rate', 'blood_pressure', 'o2_sat', 'respiratory_rate', 'recorded_at'],
  soap_notes: ['id', 'patient_id', 'subjective', 'objective', 'assessment', 'plan', 'disposition', 'created_at'],
  medication_orders: ['id', 'patient_id', 'medication', 'dosage', 'dose_amount', 'dose_unit', 'strength', 'form', 'route', 'administered_by', 'consent', 'created_at'],
  visit_logs: ['id', 'patient_id', 'event_type', 'details', 'performed_by', 'created_at'],
  immunizations: ['id', 'patient_id', 'vaccine_name', 'doses_received', 'doses_required', 'verification_status', 'updated_at'],
  parental_consents: ['id', 'patient_id', 'consent_type', 'document_name', 'parent_name', 'date_granted', 'notes', 'created_at'],
  excuse_slips: ['id', 'patient_id', 'excuse_reason', 'start_date', 'end_date', 'teacher_notified', 'teacher_notification_requested', 'checkout_at', 'verification_hash', 'acknowledgment_token_hash', 'created_by', 'principal_acknowledged', 'principal_acknowledged_at', 'departure_approved', 'departure_approved_at', 'created_at'],
  incident_alerts: ['id', 'patient_id', 'incident_details', 'adviser_name', 'adviser_status', 'adviser_confirmed_at', 'parent_name', 'parent_status', 'parent_confirmed_at', 'created_at'],
  email_alerts: ['id', 'patient_id', 'recipient_type', 'recipient_email', 'recipient_name', 'event_type', 'subject', 'body', 'text_body', 'payload_version', 'sent_at', 'acknowledged', 'acknowledged_at', 'response_status', 'delivery_status', 'provider_message_id', 'delivery_error', 'attempt_count', 'last_attempt_at', 'accepted_at', 'dedup_key'],
  clinic_settings: ['key', 'value']
});

const RELATIONS = Object.freeze({
  patients: Object.freeze({ parentColumn: 'patient_id', targetColumn: 'id' })
});

const UPSERT_KEYS = Object.freeze({ clinic_settings: 'key' });

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error('Invalid database identifier.');
  }
  return '"' + identifier + '"';
}

function assertTable(table) {
  if (!Object.prototype.hasOwnProperty.call(TABLE_COLUMNS, table)) {
    throw new Error('Unknown database table: ' + table);
  }
  return quoteIdentifier(table);
}

function assertColumn(table, column) {
  if (!TABLE_COLUMNS[table].includes(column)) {
    throw new Error('Unknown column ' + table + '.' + column);
  }
  return quoteIdentifier(column);
}

function splitProjection(projection) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < projection.length; index += 1) {
    const character = projection[index];
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(projection.slice(start, index).trim());
      start = index + 1;
    }
    if (depth < 0) throw new Error('Invalid select projection.');
  }
  if (depth !== 0) throw new Error('Invalid select projection.');
  parts.push(projection.slice(start).trim());
  return parts.filter(Boolean);
}

function projectionSql(table, projection, allowRelations = true) {
  const selections = [];
  const joins = [];
  for (const part of splitProjection(projection || '*')) {
    if (part === '*') {
      selections.push('t.*');
      continue;
    }

    const nested = part.match(/^([a-z_][a-z0-9_]*)\(([^()]*)\)$/);
    if (nested) {
      if (!allowRelations) throw new Error('Nested projections are not supported for write results.');
      const relationName = nested[1];
      const relation = RELATIONS[relationName];
      if (!relation || !TABLE_COLUMNS[table].includes(relation.parentColumn)) {
        throw new Error('Unsupported database relation: ' + relationName);
      }
      const relationAlias = 'rel_' + relationName;
      const nestedColumns = splitProjection(nested[2]);
      if (nestedColumns.length === 0 || nestedColumns.includes('*')) {
        throw new Error('Nested relation projections must name their columns.');
      }
      const jsonFields = nestedColumns.map((column) => {
        assertColumn(relationName, column);
        return "'" + column + "', " + relationAlias + '.' + quoteIdentifier(column);
      });
      selections.push(
        'CASE WHEN ' + relationAlias + '.' + quoteIdentifier(relation.targetColumn) + ' IS NULL THEN NULL ELSE jsonb_build_object(' + jsonFields.join(', ') + ') END AS ' + quoteIdentifier(relationName)
      );
      joins.push('LEFT JOIN ' + assertTable(relationName) + ' AS ' + relationAlias + ' ON ' + relationAlias + '.' + quoteIdentifier(relation.targetColumn) + ' = t.' + quoteIdentifier(relation.parentColumn));
      continue;
    }

    selections.push('t.' + assertColumn(table, part));
  }
  return { selections: selections.join(', '), joins: [...new Set(joins)] };
}

class QueryBuilder {
  constructor(database, table) {
    this.database = database;
    this.table = table;
    assertTable(table);
    this.action = 'select';
    this.columns = '*';
    this.returning = false;
    this.conditions = [];
    this.anyGroups = [];
    this.orders = [];
    this.rowLimit = null;
    this.singleMode = null;
    this.countMode = null;
    this.headOnly = false;
    this.rows = null;
    this.updateValues = null;
    this.promise = null;
  }

  select(columns = '*', options = {}) {
    if (this.action === 'select') {
      this.columns = columns || '*';
      this.countMode = options.count || null;
      this.headOnly = options.head === true;
    } else {
      this.returning = true;
      this.columns = columns || '*';
    }
    return this;
  }

  insert(rows) {
    this.action = 'insert';
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values) {
    this.action = 'update';
    this.updateValues = values;
    return this;
  }

  upsert(rows) {
    this.action = 'upsert';
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column, value) { return this._filter(column, '=', value); }
  neq(column, value) { return this._filter(column, '<>', value); }
  gt(column, value) { return this._filter(column, '>', value); }
  gte(column, value) { return this._filter(column, '>=', value); }
  lt(column, value) { return this._filter(column, '<', value); }
  lte(column, value) { return this._filter(column, '<=', value); }
  ilike(column, value) { return this._filter(column, 'ILIKE', value); }
  like(column, value) { return this._filter(column, 'LIKE', value); }

  in(column, values) {
    assertColumn(this.table, column);
    this.conditions.push({ column, operator: 'IN', value: values });
    return this;
  }

  or(filters) {
    if (!Array.isArray(filters) || filters.length === 0) {
      throw new Error('The local query builder expects .or() to receive a non-empty filter array.');
    }
    const group = filters.map((filter) => {
      const operators = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', ilike: 'ILIKE', like: 'LIKE' };
      const operator = operators[filter.operator];
      if (!operator) throw new Error('Unsupported OR filter operator.');
      assertColumn(this.table, filter.column);
      return { column: filter.column, operator, value: filter.value };
    });
    this.anyGroups.push(group);
    return this;
  }

  order(column, options = {}) {
    assertColumn(this.table, column);
    this.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(value) {
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 0) throw new Error('Limit must be a non-negative integer.');
    this.rowLimit = limit;
    return this;
  }

  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'single'; return this; }

  _filter(column, operator, value) {
    assertColumn(this.table, column);
    this.conditions.push({ column, operator, value });
    return this;
  }

  _compileWhere(values) {
    const compileFilter = (filter) => {
      const field = 't.' + assertColumn(this.table, filter.column);
      if (filter.operator === 'IN') {
        const items = Array.isArray(filter.value) ? filter.value : [];
        if (items.length === 0) return 'FALSE';
        const slots = items.map((value) => {
          values.push(value);
          return '$' + values.length;
        });
        return field + ' IN (' + slots.join(', ') + ')';
      }
      if (filter.value === null && filter.operator === '=') return field + ' IS NULL';
      if (filter.value === null && filter.operator === '<>') return field + ' IS NOT NULL';
      values.push(filter.value);
      return field + ' ' + filter.operator + ' $' + values.length;
    };

    const predicates = this.conditions.map(compileFilter);
    for (const group of this.anyGroups) {
      predicates.push('(' + group.map(compileFilter).join(' OR ') + ')');
    }
    return predicates.length ? ' WHERE ' + predicates.join(' AND ') : '';
  }

  async _executeSelect() {
    const values = [];
    const where = this._compileWhere(values);
    let count = null;
    if (this.countMode === 'exact') {
      const countResult = await this.database.query('SELECT COUNT(*)::int AS count FROM ' + assertTable(this.table) + ' AS t' + where, values);
      count = Number(countResult.rows[0].count);
    }
    if (this.headOnly) return { data: null, error: null, count };

    const projection = projectionSql(this.table, this.columns);
    let sql = 'SELECT ' + projection.selections + ' FROM ' + assertTable(this.table) + ' AS t ' + projection.joins.join(' ') + where;
    for (const order of this.orders) {
      sql += (this.orders.indexOf(order) === 0 ? ' ORDER BY ' : ', ') + 't.' + assertColumn(this.table, order.column) + (order.ascending ? ' ASC' : ' DESC');
    }
    if (this.singleMode) {
      sql += ' LIMIT 2';
    } else if (this.rowLimit !== null) {
      sql += ' LIMIT ' + this.rowLimit;
    }
    const result = await this.database.query(sql, values);
    let data = result.rows;
    if (this.singleMode) {
      if (data.length > 1 || (this.singleMode === 'single' && data.length === 0)) {
        return { data: null, error: { message: 'Expected exactly one row.', code: 'PGRST116' }, count };
      }
      data = data[0] || null;
    }
    return { data, error: null, count };
  }

  async _executeMutation() {
    const values = [];
    const quoteFields = (fields) => fields.map((column) => assertColumn(this.table, column));
    const returningSql = this.returning ? ' RETURNING ' + projectionSql(this.table, this.columns, false).selections : '';
    let sql;

    if (this.action === 'insert' || this.action === 'upsert') {
      if (!Array.isArray(this.rows) || this.rows.length === 0) return { data: this.returning ? [] : null, error: null };
      const columns = [...new Set(this.rows.flatMap((row) => Object.keys(row || {})))];
      if (columns.length === 0) throw new Error('Insert must include at least one field.');
      const quotedColumns = quoteFields(columns);
      const tuples = this.rows.map((row) => {
        const slots = columns.map((column) => {
          values.push(Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null);
          return '$' + values.length;
        });
        return '(' + slots.join(', ') + ')';
      });
      sql = 'INSERT INTO ' + assertTable(this.table) + ' AS t (' + quotedColumns.join(', ') + ') VALUES ' + tuples.join(', ');
      if (this.action === 'upsert') {
        const conflictKey = UPSERT_KEYS[this.table];
        if (!conflictKey || !columns.includes(conflictKey)) throw new Error('No local upsert conflict key is configured for ' + this.table + '.');
        const updates = columns.filter((column) => column !== conflictKey && column !== 'created_at');
        if (updates.length) {
          sql += ' ON CONFLICT (' + assertColumn(this.table, conflictKey) + ') DO UPDATE SET ' + updates.map((column) => assertColumn(this.table, column) + ' = EXCLUDED.' + assertColumn(this.table, column)).join(', ');
        } else {
          sql += ' ON CONFLICT (' + assertColumn(this.table, conflictKey) + ') DO NOTHING';
        }
      }
      sql += returningSql;
    } else if (this.action === 'update') {
      const entries = Object.entries(this.updateValues || {});
      if (entries.length === 0) throw new Error('Update must include at least one field.');
      const sets = entries.map(([column, value]) => {
        values.push(value);
        return assertColumn(this.table, column) + ' = $' + values.length;
      });
      const where = this._compileWhere(values);
      sql = 'UPDATE ' + assertTable(this.table) + ' AS t SET ' + sets.join(', ') + where + returningSql;
    } else {
      const where = this._compileWhere(values);
      sql = 'DELETE FROM ' + assertTable(this.table) + ' AS t' + where + returningSql;
    }

    const result = await this.database.query(sql, values);
    return { data: this.returning ? result.rows : null, error: null };
  }

  async execute() {
    if (this.promise) return this.promise;
    this.promise = (async () => {
      try {
        return this.action === 'select' ? await this._executeSelect() : await this._executeMutation();
      } catch (error) {
        return { data: null, error: { message: error.message, code: error.code || 'DATABASE_ERROR' } };
      }
    })();
    return this.promise;
  }

  then(onFulfilled, onRejected) { return this.execute().then(onFulfilled, onRejected); }
  catch(onRejected) { return this.execute().catch(onRejected); }
  finally(onFinally) { return this.execute().finally(onFinally); }
}

class Database {
  constructor({ databaseUrl = process.env.DATABASE_URL } = {}) {
    this.databaseUrl = databaseUrl || null;
    this.mode = 'postgresql';
    this.pool = null;
    this.initializePromise = null;
  }

  async initialize() {
    if (!this.initializePromise) {
      this.initializePromise = this._initialize().catch((error) => {
        const failedPool = this.pool;
        this.pool = null;
        if (failedPool) failedPool.end().catch(() => {});
        this.initializePromise = null;
        throw error;
      });
    }
    return this.initializePromise;
  }

  async _initialize() {
    if (!this.databaseUrl) {
      throw new Error('DATABASE_URL is required. Configure the Neon PostgreSQL connection in backend/.env or the hosting environment.');
    }
    let connection;
    try { connection = new URL(this.databaseUrl); }
    catch { throw new Error('DATABASE_URL must be a valid Neon PostgreSQL connection URL.'); }
    if (!['postgres:', 'postgresql:'].includes(connection.protocol) || !connection.hostname.endsWith('.neon.tech')) {
      throw new Error('DATABASE_URL must point to a Neon PostgreSQL host ending in .neon.tech.');
    }
    if (!['require', 'verify-ca', 'verify-full'].includes(connection.searchParams.get('sslmode'))) {
      throw new Error('The Neon connection URL must enable TLS with sslmode=require or verify-full.');
    }
    const defaultPoolSize = process.env.VERCEL ? 1 : 10;
    this.pool = new Pool({ connectionString: this.databaseUrl, max: Number(process.env.PG_POOL_SIZE || defaultPoolSize) });
    await this.pool.query('SELECT 1');
    await this._applyMigrations();
    return this;
  }

  async query(sql, values = []) {
    if (!this.pool) throw new Error('Database has not been initialized.');
    return this.pool.query(sql, values);
  }

  async transaction(work) {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error('Database has not been initialized.');
  }

  async _withMigrationTransaction(work) {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await work(client, (sql) => client.query(sql));
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      return;
    }
    throw new Error('Database has not been initialized.');
  }

  async _applyMigrations() {
    await this.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const directory = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(directory).filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file)).sort();
    for (const file of files) {
      const exists = await this.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
      if (exists.rows.length) continue;
      const migration = fs.readFileSync(path.join(directory, file), 'utf8');
      await this._withMigrationTransaction(async (transaction, executeScript) => {
        await executeScript(migration);
        await transaction.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      });
      console.log('[DATABASE] Applied migration ' + file);
    }
  }

  from(table) { return new QueryBuilder(this, table); }

  async health() {
    await this.query('SELECT 1');
    return { status: 'connected', mode: this.mode };
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

const database = new Database();

module.exports = { Database, database };
