import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// import React from 'react';
// import ReactDOM from 'react-dom';

class OnlineEd extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      courses: [
        { id: 1, name: 'Introduction to Computer Science', instructor: 'John Doe', rating: 4.5 },
        { id: 2, name: 'Linear Algebra', instructor: 'Jane Smith', rating: 4.2 },
        { id: 3, name: 'Calculus', instructor: 'Bob Johnson', rating: 4.8 },
        { id: 4, name: 'Introduction to Philosophy', instructor: 'Mary Brown', rating: 4.0 },
        { id: 5, name: 'History of Art', instructor: 'Tom Wilson', rating: 4.6 },
        { id: 6, name: 'NB', instructor: 'Tom Wilson', rating: 5.0 }
      ]
    };
  }

  render() {
    return (
        <div>
      
        <h1>OnlineEd</h1>
        <h2>Courses</h2>
        <ul>
          {this.state.courses.map(course => (
            <li key={course.id}>
              <h3>{course.name}</h3>
              <p>Instructor: {course.instructor}</p>
              <p>Rating: {course.rating}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}


const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<OnlineEd />);