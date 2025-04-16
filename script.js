document.addEventListener('DOMContentLoaded', () => {
  const bookingForm = document.getElementById('booking-form');
  const reservationsBody = document.getElementById('reservations-body');

  // Load reservations from Local Storage
  let reservations = JSON.parse(localStorage.getItem('reservations')) || [];

  // Render reservations
  function renderReservations() {
    reservationsBody.innerHTML = '';
    reservations.forEach((res, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${res.name}</td>
        <td>${res.date}</td>
        <td>${res.time}</td>
        <td>${res.guests}</td>
        <td>
          <button class="action-btn edit-btn" onclick="editReservation(${index})">Edit</button>
          <button class="action-btn delete-btn" onclick="deleteReservation(${index})">Delete</button>
        </td>
      `;
      reservationsBody.appendChild(row);
    });
  }

  // Save reservations to Local Storage
  function saveReservations() {
    localStorage.setItem('reservations', JSON.stringify(reservations));
    renderReservations();
  }

  // Handle form submission
  bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    const guests = document.getElementById('guests').value;

    reservations.push({ name, date, time, guests });
    saveReservations();
    bookingForm.reset();
  });

  // Delete reservation
  window.deleteReservation = function(index) {
    reservations.splice(index, 1);
    saveReservations();
  };

  // Edit reservation
  window.editReservation = function(index) {
    const res = reservations[index];
    document.getElementById('name').value = res.name;
    document.getElementById('date').value = res.date;
    document.getElementById('time').value = res.time;
    document.getElementById('guests').value = res.guests;

    // Remove the reservation and let user resubmit
    reservations.splice(index, 1);
    saveReservations();
  };

  // Initial render
  renderReservations();
});