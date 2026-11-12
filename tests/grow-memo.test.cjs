const { bundle } = require('./bundle.cjs')
const { Tracker } = require('./helpers.cjs')
async function run() {
  const t = new Tracker('grow-memo')
  const { ageNumberForCharacter, openingGreeting } = bundle('src/data/characterAge.ts')
  const { MISSIONS_REQUIRED_PER_TYPE_BY_TIER: required } = bundle('api/_lib/characterAge.ts')
  t.assert(ageNumberForCharacter(1, 'teen') === 10, 'mission evolution at level 1 displays age 10, not age 8')
  t.assert(ageNumberForCharacter(20, 'toddler') === 9, 'a mission-pinned child cannot display an adult age')
  t.assert(ageNumberForCharacter(65, 'master_50s') === 65, 'late-life ages remain unchanged')
  t.assert(required.toddler.objective === 2 && required.toddler.subjective === 2 && required.toddler.cardmatch === 1 && required.toddler.knowhow === 1, 'introductory six missions use 2+2+1+1')
  t.assert(required.teen.objective === 4 && required.teen.subjective === 3 && required.teen.knowhow === 3 && required.teen.cardmatch === 0, 'later-stage learning requirements stay unchanged')
  t.assert(openingGreeting('김세희', null).includes('김세희예요'), 'greeting introduces the chosen name naturally')
  t.assert(openingGreeting('동진', null).includes('동진이에요'), 'greeting handles Korean final consonants')
  return t.summary()
}
module.exports = { run }
