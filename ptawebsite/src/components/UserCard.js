const UserCard = ({user}) => {
    return (
        <div className="user-card">
            <h3>{user.username}</h3>
            <p>{user.password}</p>
            {/* <div className="rating">{user.rating}</div> */}
        </div>

    )
}

export default UserCard