import assert from 'assert'

import {Presence} from '../src/index.js'
import {Map, fromJS} from 'immutable'

let clone = (obj) => { return JSON.parse(JSON.stringify(obj)) }

const assertImmutableEquals = (expected, actual) => {
  // Test using Immutables equals method
  if (!expected.equals(actual)){
    // Produce readable diffs
    assert.deepEqual(expected.toJS(), actual.toJS())
    // failsafe, if toJS somehow was equals
    assert(expected.equals(actual))
  }
}
let fixtures = {
  joins () {
    return {u1: {metas: [{id: 1, phx_ref: '1.2'}]}}
  },
  leaves () {
    return {u2: {metas: [{id: 2, phx_ref: '2'}]}}
  },
  state () {
    return {
      u1: {metas: [{id: 1, phx_ref: '1'}]},
      u2: {metas: [{id: 2, phx_ref: '2'}]},
      u3: {metas: [{id: 3, phx_ref: '3'}]}
    }
  },
  immutableState () {
    return fromJS(this.state())
  }
}

describe('syncState', () => {
  it('syncs empty state', () => {
    const newStateData = {u1: {metas: [{id: 1, phx_ref: '1'}]}}
    const state = new Map()
    const newState = Presence.syncState(state, newStateData)
    assert.deepEqual(state, new Map())
    assert.deepEqual(newState.toJS(), newStateData)
  })

  it("onJoins new presences and onLeave's left presences", () => {
    const newState = fixtures.immutableState()
    const state = fromJS({u4: {metas: [{id: 4, phx_ref: '4'}]}})
    let joined = {}
    let left = {}
    const onJoin = (key, current, newPres) => {
      joined[key] = {current: current && current.toJS(), newPres: newPres.toJS()}
    }
    const onLeave = (key, current, leftPres) => {
      left[key] = {current: current && current.toJS(), leftPres: leftPres.toJS()}
    }
    const syncedState = Presence.syncState(state, newState, onJoin, onLeave)
    assert(syncedState.equals(newState))
    assert.deepEqual(joined, {
      u1: {current: null, newPres: {metas: [{id: 1, phx_ref: '1'}]}},
      u2: {current: null, newPres: {metas: [{id: 2, phx_ref: '2'}]}},
      u3: {current: null, newPres: {metas: [{id: 3, phx_ref: '3'}]}}
    })
    assert.deepEqual(left, {
      u4: {current: {metas: []}, leftPres: {metas: [{id: 4, phx_ref: '4'}]}}
    })
  })

  it('onJoins only newly added metas', () => {
    const newState = fromJS({u3: {metas: [{id: 3, phx_ref: '3'}, {id: 3, phx_ref: '3.new'}]}})
    const state = fromJS({u3: {metas: [{id: 3, phx_ref: '3'}]}})
    const joined = {}
    const left = {}
    const onJoin = (key, current, newPres) => {
      joined[key] = {current: current && current.toJS(), newPres: newPres.toJS()}
    }
    const onLeave = (key, current, leftPres) => {
      left[key] = {current: current && current.toJS(), leftPres: leftPres.toJS()}
    }
    const syncedState = Presence.syncState(state, newState, onJoin, onLeave)
    if (!syncedState.equals(newState)) {
      assert.deepEqual(syncedState.toJS(), newState.toJS())
    }
    assert.deepEqual(joined, {
      u3: {current: {metas: [{id: 3, phx_ref: '3'}]},
        newPres: {metas: [{id: 3, phx_ref: '3'}, {id: 3, phx_ref: '3.new'}]}}
    })
    assert.deepEqual(left, {})
  })
})

describe('syncDiff', () => {
  it('does nothing without leaves or joins', () => {
    const state = new Map()
    const newState = Presence.syncDiff(state, {joins: {}, leaves: {}})
    assert.deepEqual(newState, state)
  })

  it('syncs empty state', () => {
    let joins = {u1: {metas: [{id: 1, phx_ref: '1'}]}}
    const state = new Map({})
    const newState = Presence.syncDiff(state, {joins: joins, leaves: {}})
    assert.deepEqual(joins, newState.toJS())
  })

  it('adds additional meta', () => {
    let state = fixtures.immutableState()
    const newState = Presence.syncDiff(state, {joins: fixtures.joins(), leaves: {}})

    assert.deepEqual({
      u1: {metas: [{id: 1, phx_ref: '1'}, {id: 1, phx_ref: '1.2'}]},
      u2: {metas: [{id: 2, phx_ref: '2'}]},
      u3: {metas: [{id: 3, phx_ref: '3'}]}
    }, newState.toJS())
  })

  it('removes presence when meta is empty and adds additional meta', () => {
    let state = fixtures.immutableState()
    const newState = Presence.syncDiff(state, {joins: fixtures.joins(), leaves: fixtures.leaves()})

    assert.deepEqual({
      u1: {metas: [{id: 1, phx_ref: '1'}, {id: 1, phx_ref: '1.2'}]},
      u3: {metas: [{id: 3, phx_ref: '3'}]}
    },
    newState.toJS())
  })

  it('removes meta while leaving key if other metas exist', () => {
    const state = fromJS({
      u1: {metas: [{id: 1, phx_ref: '1'}, {id: 1, phx_ref: '1.2'}]}
    })
    const newState = Presence.syncDiff(state, {joins: {}, leaves: {u1: {metas: [{id: 1, phx_ref: '1'}]}}})

    assert.deepEqual({
      u1: {metas: [{id: 1, phx_ref: '1.2'}]}
    }, newState.toJS())
  })
})

describe('list', () => {
  it('lists full presence by default', () => {
    const state = fixtures.immutableState()
    const expected = fromJS([
      {metas: [{id: 1, phx_ref: '1'}]},
      {metas: [{id: 2, phx_ref: '2'}]},
      {metas: [{id: 3, phx_ref: '3'}]}
    ])
    assertImmutableEquals(expected, Presence.list(state))
  })

  it('lists with custom function', () => {
    let state = fromJS({u1: {metas: [
      {id: 1, phx_ref: '1.first'},
      {id: 1, phx_ref: '1.second'}]
    }})

    assertImmutableEquals(
      fromJS([{id: 1, phx_ref: '1.first'}]),
      Presence.list(state, (_key, value) => value.get('metas').first())
    )
  })
})
