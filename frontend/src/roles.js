export function roleLabel(role = 'guest') {
  return { admin: 'Administrator', physician: 'Physician', nurse: 'Nurse', teacher: 'Teacher', guidance_counselor: 'Guidance Counselor' }[role]
    || role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
